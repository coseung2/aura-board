import type { LiveQuizStateResponse } from "./contracts";

export type LiveQuizRealtimeCounter = {
  sessionKey: string;
  questionId: string;
  answerCount: number;
};

export function estimateServerOffsetMs(
  serverNow: string,
  requestStartedAtMs: number,
  responseReceivedAtMs: number,
): number | null {
  const serverNowMs = Date.parse(serverNow);
  if (
    !Number.isFinite(serverNowMs) ||
    !Number.isFinite(requestStartedAtMs) ||
    !Number.isFinite(responseReceivedAtMs)
  ) {
    return null;
  }

  const roundTripMs = Math.max(0, responseReceivedAtMs - requestStartedAtMs);
  const requestMidpointMs = requestStartedAtMs + roundTripMs / 2;
  return serverNowMs - requestMidpointMs;
}

export function liveQuizBoundaryTarget(
  state: LiveQuizStateResponse,
): string | null {
  if (state.phase === "live") return state.stageEndsAt;
  if (state.phase === "waiting") return state.startsAt;
  if (state.phase === "setup" || state.phase === "finished") {
    return state.nextStartsAt;
  }
  return null;
}

export function parseLiveQuizRealtimeCounter(
  value: unknown,
): LiveQuizRealtimeCounter | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.sessionKey !== "string" ||
    row.sessionKey.length === 0 ||
    typeof row.questionId !== "string" ||
    row.questionId.length === 0 ||
    typeof row.answerCount !== "number" ||
    !Number.isSafeInteger(row.answerCount) ||
    row.answerCount < 0
  ) {
    return null;
  }

  return {
    sessionKey: row.sessionKey,
    questionId: row.questionId,
    answerCount: row.answerCount,
  };
}

export function liveQuizCounterKey(
  sessionKey: string,
  questionId: string,
): string {
  return `${sessionKey}:${questionId}`;
}

export function mergeLiveQuizAnswerCount(
  state: LiveQuizStateResponse,
  counter: LiveQuizRealtimeCounter,
): LiveQuizStateResponse {
  if (
    state.sessionKey !== counter.sessionKey ||
    state.question?.id !== counter.questionId ||
    counter.answerCount <= state.activeAnswerCount
  ) {
    return state;
  }
  return { ...state, activeAnswerCount: counter.answerCount };
}

export function mergeCachedLiveQuizAnswerCount(
  state: LiveQuizStateResponse,
  answerCounts: ReadonlyMap<string, number>,
): LiveQuizStateResponse {
  if (!state.question) return state;
  const answerCount = answerCounts.get(
    liveQuizCounterKey(state.sessionKey, state.question.id),
  );
  if (answerCount === undefined) return state;
  return mergeLiveQuizAnswerCount(state, {
    sessionKey: state.sessionKey,
    questionId: state.question.id,
    answerCount,
  });
}
