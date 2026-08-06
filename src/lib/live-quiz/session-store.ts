import "server-only";

import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type { LiveQuizStateResponse } from "./contracts";
import {
  ensureStarterLiveQuizQuestions,
  readApprovedQuestionIds,
  readQuestion,
} from "./question-store";
import {
  LIVE_QUIZ_ANSWER_SECONDS,
  LIVE_QUIZ_MAX_QUESTIONS,
  LIVE_QUIZ_MIN_QUESTIONS,
  addKstDays,
  kstDayKey,
  liveQuizEndsAt,
  liveQuizLockAt,
  liveQuizStartsAt,
  liveQuizTimeline,
} from "./schedule";
import {
  type CountRow,
  type LiveQuizViewer,
  LiveQuizError,
  normalizeChoices,
  normalizeQuestionIds,
} from "./server-core";

type LiveQuizSessionRow = {
  id: string;
  sessionKey: string;
  startsAt: Date;
  endsAt: Date;
  questionIds: unknown;
  questionCount: number;
  createdAt: Date;
};

type LiveQuizAnswerRow = {
  id: string;
  selectedChoice: number;
  isCorrect: boolean;
  responseMs: number;
};

type ScoreRow = {
  score: number;
  answeredCount: number;
};

type SessionContext = {
  sessionKey: string;
  startsAt: Date;
  lockAt: Date;
  session: LiveQuizSessionRow | null;
  questionCount: number;
};

async function readSession(
  sessionKey: string,
): Promise<LiveQuizSessionRow | null> {
  const [session] = await db.$queryRaw<LiveQuizSessionRow[]>(Prisma.sql`
    SELECT
      "id", "sessionKey", "startsAt", "endsAt", "questionIds",
      "questionCount", "createdAt"
    FROM "LiveQuizSession"
    WHERE "sessionKey" = ${sessionKey}
    LIMIT 1
  `);
  return session ?? null;
}

function selectSessionQuestionIds(
  sessionKey: string,
  approvedIds: string[],
): string[] {
  return approvedIds
    .map((id) => ({
      id,
      order: createHash("sha256")
        .update(`${sessionKey}:${id}`)
        .digest("hex"),
    }))
    .sort((left, right) => left.order.localeCompare(right.order))
    .slice(0, LIVE_QUIZ_MAX_QUESTIONS)
    .map((entry) => entry.id);
}

async function resolveSession(now: Date): Promise<SessionContext> {
  const sessionKey = kstDayKey(now);
  const startsAt = liveQuizStartsAt(sessionKey);
  const lockAt = liveQuizLockAt(sessionKey);
  const existing = await readSession(sessionKey);
  if (existing) {
    return {
      sessionKey,
      startsAt,
      lockAt,
      session: existing,
      questionCount: existing.questionCount,
    };
  }

  await ensureStarterLiveQuizQuestions();
  // Session rows are created lazily, but once the 13:25 lock passes the
  // candidate pool is reconstructed as it stood at that cutoff.
  const approvedIds = await readApprovedQuestionIds(
    now.getTime() >= lockAt.getTime() ? lockAt : undefined,
  );
  const questionCount = Math.min(LIVE_QUIZ_MAX_QUESTIONS, approvedIds.length);

  if (
    now.getTime() < lockAt.getTime() ||
    questionCount < LIVE_QUIZ_MIN_QUESTIONS
  ) {
    return { sessionKey, startsAt, lockAt, session: null, questionCount };
  }

  const questionIds = selectSessionQuestionIds(sessionKey, approvedIds);
  const endsAt = liveQuizEndsAt(startsAt, questionIds.length);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "LiveQuizSession" (
      "id", "sessionKey", "startsAt", "endsAt", "questionIds",
      "questionCount", "createdAt"
    )
    VALUES (
      ${randomUUID()}, ${sessionKey}, ${startsAt}, ${endsAt},
      CAST(${JSON.stringify(questionIds)} AS JSONB), ${questionIds.length}, ${now}
    )
    ON CONFLICT ("sessionKey") DO NOTHING
  `);

  const session = await readSession(sessionKey);
  if (!session) throw new LiveQuizError("session_creation_failed", 503);
  return {
    sessionKey,
    startsAt,
    lockAt,
    session,
    questionCount: session.questionCount,
  };
}

async function readViewerScore(
  sessionId: string,
  viewer: LiveQuizViewer,
  questionIds: string[],
): Promise<ScoreRow> {
  if (questionIds.length === 0) return { score: 0, answeredCount: 0 };
  const [row] = await db.$queryRaw<ScoreRow[]>(Prisma.sql`
    SELECT
      COALESCE(SUM(CASE WHEN "isCorrect" THEN 1 ELSE 0 END), 0)::int AS "score",
      COUNT(*)::int AS "answeredCount"
    FROM "LiveQuizAnswer"
    WHERE "sessionId" = ${sessionId}
      AND "participantType" = ${viewer.kind}
      AND "participantId" = ${viewer.id}
      AND "questionId" IN (${Prisma.join(questionIds)})
  `);
  return row ?? { score: 0, answeredCount: 0 };
}

async function readViewerAnswer(
  sessionId: string,
  questionId: string,
  viewer: LiveQuizViewer,
): Promise<LiveQuizAnswerRow | null> {
  const [answer] = await db.$queryRaw<LiveQuizAnswerRow[]>(Prisma.sql`
    SELECT "id", "selectedChoice", "isCorrect", "responseMs"
    FROM "LiveQuizAnswer"
    WHERE "sessionId" = ${sessionId}
      AND "questionId" = ${questionId}
      AND "participantType" = ${viewer.kind}
      AND "participantId" = ${viewer.id}
    LIMIT 1
  `);
  return answer ?? null;
}

async function countQuestionAnswers(
  sessionId: string,
  questionId: string,
): Promise<number> {
  const [row] = await db.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "LiveQuizAnswer"
    WHERE "sessionId" = ${sessionId}
      AND "questionId" = ${questionId}
  `);
  return row?.count ?? 0;
}

function emptyState(input: {
  phase: "waiting" | "setup";
  now: Date;
  sessionKey: string;
  startsAt: Date;
  questionCount: number;
  setupReason?: string;
}): LiveQuizStateResponse {
  const endsAt = liveQuizEndsAt(input.startsAt, input.questionCount);
  return {
    phase: input.phase,
    serverNow: input.now.toISOString(),
    sessionKey: input.sessionKey,
    startsAt: input.startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    nextStartsAt: input.startsAt.toISOString(),
    questionCount: input.questionCount,
    score: 0,
    answeredCount: 0,
    questionNumber: null,
    stage: null,
    stageEndsAt: input.startsAt.toISOString(),
    question: null,
    selectedChoice: null,
    correctChoice: null,
    isCorrect: null,
    explanation: null,
    activeAnswerCount: 0,
    setupReason: input.setupReason ?? null,
  };
}

export async function readLiveQuizState(
  viewer: LiveQuizViewer,
  now = new Date(),
): Promise<LiveQuizStateResponse> {
  const context = await resolveSession(now);
  if (context.questionCount < LIVE_QUIZ_MIN_QUESTIONS) {
    return emptyState({
      phase: "setup",
      now,
      sessionKey: context.sessionKey,
      startsAt: context.startsAt,
      questionCount: context.questionCount,
      setupReason: `방송을 시작하려면 승인된 문제가 ${LIVE_QUIZ_MIN_QUESTIONS}개 이상 필요합니다.`,
    });
  }

  if (!context.session) {
    return emptyState({
      phase: "waiting",
      now,
      sessionKey: context.sessionKey,
      startsAt: context.startsAt,
      questionCount: context.questionCount,
    });
  }

  const session = context.session;
  const questionIds = normalizeQuestionIds(session.questionIds);
  const timeline = liveQuizTimeline(now, session.startsAt, session.questionCount);

  if (timeline.phase === "waiting") {
    return {
      ...emptyState({
        phase: "waiting",
        now,
        sessionKey: session.sessionKey,
        startsAt: session.startsAt,
        questionCount: session.questionCount,
      }),
      endsAt: session.endsAt.toISOString(),
    };
  }

  if (timeline.phase === "finished") {
    const score = await readViewerScore(session.id, viewer, questionIds);
    const nextStartsAt = liveQuizStartsAt(addKstDays(session.sessionKey, 1));
    return {
      phase: "finished",
      serverNow: now.toISOString(),
      sessionKey: session.sessionKey,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      nextStartsAt: nextStartsAt.toISOString(),
      questionCount: session.questionCount,
      score: score.score,
      answeredCount: score.answeredCount,
      questionNumber: null,
      stage: null,
      stageEndsAt: session.endsAt.toISOString(),
      question: null,
      selectedChoice: null,
      correctChoice: null,
      isCorrect: null,
      explanation: null,
      activeAnswerCount: 0,
      setupReason: null,
    };
  }

  const questionId = questionIds[timeline.questionIndex];
  if (!questionId) throw new LiveQuizError("session_question_missing", 503);
  const question = await readQuestion(questionId);
  const choices = normalizeChoices(question?.choices);
  if (!question || !choices) {
    throw new LiveQuizError("session_question_invalid", 503);
  }

  const scoredQuestionIds = questionIds.slice(
    0,
    timeline.questionIndex + (timeline.stage === "reveal" ? 1 : 0),
  );
  const [score, currentAnswer, activeAnswerCount] = await Promise.all([
    readViewerScore(session.id, viewer, scoredQuestionIds),
    readViewerAnswer(session.id, questionId, viewer),
    countQuestionAnswers(session.id, questionId),
  ]);
  const reveal = timeline.stage === "reveal";

  return {
    phase: "live",
    serverNow: now.toISOString(),
    sessionKey: session.sessionKey,
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    nextStartsAt: session.startsAt.toISOString(),
    questionCount: session.questionCount,
    score: score.score,
    answeredCount: score.answeredCount,
    questionNumber: timeline.questionIndex + 1,
    stage: timeline.stage,
    stageEndsAt: timeline.stageEndsAt.toISOString(),
    question: {
      id: question.id,
      prompt: question.prompt,
      choices,
      category: question.category,
    },
    selectedChoice: currentAnswer?.selectedChoice ?? null,
    correctChoice: reveal ? question.correctChoice : null,
    isCorrect: reveal ? currentAnswer?.isCorrect ?? null : null,
    explanation: reveal ? question.explanation : null,
    activeAnswerCount,
    setupReason: null,
  };
}

export async function submitLiveQuizAnswer(
  viewer: LiveQuizViewer,
  input: {
    sessionKey: string;
    questionId: string;
    selectedChoice: number;
  },
  now = new Date(),
): Promise<{ selectedChoice: number; accepted: boolean }> {
  const context = await resolveSession(now);
  const session = context.session;
  if (!session || input.sessionKey !== session.sessionKey) {
    throw new LiveQuizError("session_not_live", 409);
  }

  const timeline = liveQuizTimeline(now, session.startsAt, session.questionCount);
  if (timeline.phase !== "live" || timeline.stage !== "answer") {
    throw new LiveQuizError("answer_window_closed", 409);
  }

  const questionIds = normalizeQuestionIds(session.questionIds);
  const activeQuestionId = questionIds[timeline.questionIndex];
  if (!activeQuestionId || input.questionId !== activeQuestionId) {
    throw new LiveQuizError("question_changed", 409);
  }

  const existing = await readViewerAnswer(session.id, activeQuestionId, viewer);
  if (existing) {
    return { selectedChoice: existing.selectedChoice, accepted: false };
  }

  const question = await readQuestion(activeQuestionId);
  if (!question) throw new LiveQuizError("question_not_found", 404);
  const responseMs = Math.max(
    0,
    Math.min(
      LIVE_QUIZ_ANSWER_SECONDS * 1000,
      now.getTime() - timeline.roundStartedAt.getTime(),
    ),
  );
  const isCorrect = input.selectedChoice === question.correctChoice;
  const inserted = await db.$queryRaw<Array<{ selectedChoice: number }>>(
    Prisma.sql`
      INSERT INTO "LiveQuizAnswer" (
        "id", "sessionId", "questionId", "participantType", "participantId",
        "participantName", "selectedChoice", "isCorrect", "responseMs", "createdAt"
      )
      VALUES (
        ${randomUUID()}, ${session.id}, ${activeQuestionId}, ${viewer.kind}, ${viewer.id},
        ${viewer.name}, ${input.selectedChoice}, ${isCorrect}, ${responseMs}, ${now}
      )
      ON CONFLICT (
        "sessionId", "questionId", "participantType", "participantId"
      ) DO NOTHING
      RETURNING "selectedChoice"
    `,
  );

  if (inserted[0]) {
    return { selectedChoice: inserted[0].selectedChoice, accepted: true };
  }
  const raced = await readViewerAnswer(session.id, activeQuestionId, viewer);
  if (!raced) throw new LiveQuizError("answer_save_failed", 503);
  return { selectedChoice: raced.selectedChoice, accepted: false };
}
