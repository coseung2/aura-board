import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getTeacherKeyForClassroom } from "@/lib/llm/teacher-key";
import {
  evaluateReadingWithGemma,
  ReadingGemmaError,
} from "@/lib/reading-gemma";
import { limitReadingFeedback } from "@/lib/rate-limit-routes";
import { getCurrentStudent } from "@/lib/student-auth";
import type { ReadingBookType } from "@/lib/reading-evaluator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE_PROCESSING_MS = 2 * 60 * 1_000;
const MAX_STORED_ERROR_LENGTH = 240;

type RouteContext = {
  params: Promise<{ logId: string }>;
};

function publicError(error: ReadingGemmaError): {
  status: number;
  error: string;
  message: string;
} {
  switch (error.code) {
    case "invalid_key":
      return {
        status: 503,
        error: "reading_gemini_key_invalid",
        message: "담임 선생님의 Gemini API 키를 확인해 주세요.",
      };
    case "quota_exceeded":
      return {
        status: 429,
        error: "reading_gemma_quota_exceeded",
        message: "AI 무료 사용 한도가 잠시 부족해요. 조금 뒤 다시 시도해 주세요.",
      };
    case "timeout":
      return {
        status: 504,
        error: "reading_gemma_timeout",
        message: "AI 피드백 생성 시간이 초과되었어요. 다시 시도해 주세요.",
      };
    case "invalid_response":
      return {
        status: 502,
        error: "reading_gemma_invalid_response",
        message: "AI가 피드백 형식에 맞게 답하지 못했어요. 다시 시도해 주세요.",
      };
    default:
      return {
        status: 502,
        error: "reading_gemma_failed",
        message: "AI 피드백을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.",
      };
  }
}

async function markFailed(logId: string, message: string) {
  await db.readingLog.updateMany({
    where: { id: logId },
    data: {
      aiFeedbackStatus: "failed",
      aiFeedbackError: message.slice(0, MAX_STORED_ERROR_LENGTH),
    },
  });
}

function evaluationResponse(row: {
  aiScore: number | null;
  aiFeedback: string | null;
  aiFeedbackStatus: string;
  aiFeedbackModel: string | null;
  aiFeedbackError: string | null;
  evaluatedAt: Date | null;
}) {
  return {
    aiScore: row.aiScore,
    aiFeedback: row.aiFeedback,
    aiFeedbackStatus: row.aiFeedbackStatus,
    aiFeedbackModel: row.aiFeedbackModel,
    aiFeedbackError: row.aiFeedbackError,
    evaluatedAt: row.evaluatedAt?.toISOString() ?? null,
  };
}

export async function POST(_req: Request, { params }: RouteContext) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { logId } = await params;
  const log = await db.readingLog.findFirst({
    where: {
      id: logId,
      studentId: student.id,
      classroomId: student.classroomId,
    },
  });
  if (!log) {
    return NextResponse.json({ error: "reading_log_not_found" }, { status: 404 });
  }

  if (
    log.aiFeedbackStatus === "generated" &&
    log.aiScore !== null &&
    log.aiFeedback
  ) {
    return NextResponse.json({
      evaluation: evaluationResponse(log),
      alreadyGenerated: true,
    });
  }

  const teacherKey = await getTeacherKeyForClassroom(log.classroomId);
  if (!teacherKey || teacherKey.provider !== "gemini" || !teacherKey.apiKey) {
    await markFailed(log.id, "담임 선생님이 설정에서 Gemini API 키를 먼저 연결해야 해요.");
    return NextResponse.json(
      {
        error: "reading_gemini_key_missing",
        message: "담임 선생님이 설정에서 Gemini API 키를 먼저 연결해야 해요.",
      },
      { status: 503 },
    );
  }

  const limit = await limitReadingFeedback(teacherKey.teacherId, student.id);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "reading_feedback_rate_limited",
        message: "AI 피드백 요청이 몰렸어요. 잠시 후 다시 시도해 주세요.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const claimed = await db.readingLog.updateMany({
    where: {
      id: log.id,
      studentId: student.id,
      OR: [
        { aiFeedbackStatus: { in: ["pending", "failed"] } },
        { aiFeedbackStatus: "processing", updatedAt: { lt: staleBefore } },
      ],
    },
    data: {
      aiFeedbackStatus: "processing",
      aiFeedbackError: null,
    },
  });

  if (claimed.count === 0) {
    const current = await db.readingLog.findUnique({ where: { id: log.id } });
    if (
      current?.aiFeedbackStatus === "generated" &&
      current.aiScore !== null &&
      current.aiFeedback
    ) {
      return NextResponse.json({
        evaluation: evaluationResponse(current),
        alreadyGenerated: true,
      });
    }
    return NextResponse.json(
      {
        error: "reading_feedback_in_progress",
        message: "AI 피드백을 이미 만들고 있어요.",
      },
      { status: 409 },
    );
  }

  try {
    const result = await evaluateReadingWithGemma({
      apiKey: teacherKey.apiKey,
      modelId: process.env.READING_GEMMA_MODEL_ID,
      input: {
        bookType: (log.bookType === "comic" ? "comic" : "story") as ReadingBookType,
        title: log.title,
        author: log.author,
        reflection: log.reflection,
      },
    });

    const updated = await db.readingLog.update({
      where: { id: log.id },
      data: {
        aiScore: result.evaluation.score,
        aiFeedback: result.evaluation.feedback,
        aiFeedbackStatus: "generated",
        aiFeedbackModel: result.model,
        aiFeedbackError: null,
        evaluatedAt: new Date(),
      },
    });

    return NextResponse.json({
      evaluation: evaluationResponse(updated),
      breakdown: result.evaluation.breakdown,
      alreadyGenerated: false,
    });
  } catch (error) {
    const gemmaError =
      error instanceof ReadingGemmaError
        ? error
        : new ReadingGemmaError(
            "provider_error",
            error instanceof Error ? error.message : "unknown reading feedback error",
          );
    console.error("[reading-feedback] Gemma evaluation failed", {
      logId: log.id,
      code: gemmaError.code,
      providerStatus: gemmaError.providerStatus,
    });
    const response = publicError(gemmaError);
    await markFailed(log.id, response.message);
    return NextResponse.json(
      { error: response.error, message: response.message },
      { status: response.status },
    );
  }
}
