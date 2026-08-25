import "server-only";

import { db } from "@/lib/db";
import { getTeacherKeyForClassroom } from "@/lib/llm/teacher-key";
import { evaluateReadingWithLlm, ReadingLlmError } from "@/lib/reading-llm";
import type { ReadingBookType } from "@/lib/reading-evaluator";

const PENDING_GRACE_MS = 2 * 60 * 1_000;
const STALE_PROCESSING_MS = 2 * 60 * 1_000;
const MAX_STORED_ERROR_LENGTH = 240;

export type ReadingFeedbackWorkerResult =
  | { outcome: "idle" }
  | { outcome: "generated"; logId: string; score: number }
  | { outcome: "failed"; logId: string; error: string }
  | { outcome: "superseded"; logId: string };

function publicErrorMessage(error: ReadingLlmError): string {
  switch (error.code) {
    case "invalid_key":
      return "담임 선생님의 AI API 키를 확인해 주세요.";
    case "quota_exceeded":
      return "AI 무료 사용 한도가 일시 부족해요. 잠시 후 다시 시도해 주세요.";
    case "timeout":
      return "AI 피드백 생성 시간이 초과되었어요. 다시 시도해 주세요.";
    case "invalid_response":
      return "AI가 피드백 형식에 맞게 답하지 못했어요. 다시 시도해 주세요.";
    default:
      return "AI 피드백을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

async function markFailed(
  logId: string,
  currentRevision: number,
  message: string,
): Promise<void> {
  await db.readingLog.updateMany({
    where: {
      id: logId,
      currentRevision,
      aiFeedbackStatus: "processing",
    },
    data: {
      aiFeedbackStatus: "failed",
      aiFeedbackError: message.slice(0, MAX_STORED_ERROR_LENGTH),
    },
  });
}

export async function processNextReadingFeedback(
  now = new Date(),
): Promise<ReadingFeedbackWorkerResult> {
  const pendingBefore = new Date(now.getTime() - PENDING_GRACE_MS);
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  const log = await db.readingLog.findFirst({
    where: {
      OR: [
        { aiFeedbackStatus: "pending", createdAt: { lt: pendingBefore } },
        { aiFeedbackStatus: "processing", updatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      classroomId: true,
      currentRevision: true,
      bookType: true,
      title: true,
      author: true,
      reflection: true,
    },
  });

  if (!log) return { outcome: "idle" };

  const claimed = await db.readingLog.updateMany({
    where: {
      id: log.id,
      currentRevision: log.currentRevision,
      OR: [
        { aiFeedbackStatus: "pending", createdAt: { lt: pendingBefore } },
        { aiFeedbackStatus: "processing", updatedAt: { lt: staleBefore } },
      ],
    },
    data: { aiFeedbackStatus: "processing", aiFeedbackError: null },
  });
  if (claimed.count === 0) {
    return { outcome: "superseded", logId: log.id };
  }

  try {
    const teacherKey = await getTeacherKeyForClassroom(log.classroomId, "reading");
    if (!teacherKey?.apiKey) {
      const message = "담임 선생님이 설정에서 AI API 키를 먼저 연결해야 해요.";
      await markFailed(log.id, log.currentRevision, message);
      return { outcome: "failed", logId: log.id, error: "reading_ai_key_missing" };
    }

    const result = await evaluateReadingWithLlm({
      provider: teacherKey.provider,
      apiKey: teacherKey.apiKey,
      modelId: teacherKey.modelId,
      baseUrl: teacherKey.baseUrl,
      input: {
        bookType: (log.bookType === "comic" ? "comic" : "story") as ReadingBookType,
        title: log.title,
        author: log.author,
        reflection: log.reflection,
      },
    });

    const saved = await db.$transaction(async (tx) => {
      const evaluatedAt = new Date();
      const generated = await tx.readingLog.updateMany({
        where: {
          id: log.id,
          currentRevision: log.currentRevision,
          aiFeedbackStatus: "processing",
        },
        data: {
          aiScore: result.evaluation.score,
          aiFeedback: result.evaluation.feedback,
          aiFeedbackStatus: "generated",
          aiFeedbackModel: result.model,
          aiFeedbackError: null,
          evaluatedAt,
        },
      });
      if (generated.count === 0) return false;

      if (result.evaluation.score >= 5) {
        await tx.readingLog.updateMany({
          where: { id: log.id, missionCounted: false },
          data: { missionCounted: true, missionCountedAt: evaluatedAt },
        });
      }
      return true;
    });

    return saved
      ? { outcome: "generated", logId: log.id, score: result.evaluation.score }
      : { outcome: "superseded", logId: log.id };
  } catch (error) {
    const readingError =
      error instanceof ReadingLlmError
        ? error
        : new ReadingLlmError(
            "provider_error",
            error instanceof Error ? error.message : "unknown reading feedback error",
          );
    console.error("[reading-feedback-worker] evaluation failed", {
      logId: log.id,
      code: readingError.code,
      providerStatus: readingError.providerStatus,
    });
    await markFailed(log.id, log.currentRevision, publicErrorMessage(readingError));
    return { outcome: "failed", logId: log.id, error: readingError.code };
  }
}
