import { describe, expect, it } from "vitest";

import type { LiveQuizStateResponse } from "./contracts";
import {
  estimateServerOffsetMs,
  liveQuizBoundaryTarget,
  liveQuizCounterKey,
  mergeCachedLiveQuizAnswerCount,
  mergeLiveQuizAnswerCount,
  parseLiveQuizRealtimeCounter,
} from "./client-sync";

function liveState(
  overrides: Partial<LiveQuizStateResponse> = {},
): LiveQuizStateResponse {
  return {
    phase: "live",
    serverNow: "2026-08-06T04:30:00.000Z",
    sessionKey: "2026-08-06",
    startsAt: "2026-08-06T04:30:00.000Z",
    endsAt: "2026-08-06T04:34:10.000Z",
    nextStartsAt: "2026-08-06T04:30:00.000Z",
    questionCount: 10,
    score: 0,
    answeredCount: 0,
    questionNumber: 1,
    stage: "answer",
    stageEndsAt: "2026-08-06T04:30:20.000Z",
    question: {
      id: "question-1",
      prompt: "문제",
      choices: ["A", "B", "C", "D"],
      category: null,
    },
    selectedChoice: null,
    correctChoice: null,
    isCorrect: null,
    explanation: null,
    activeAnswerCount: 2,
    setupReason: null,
    ...overrides,
  };
}

describe("live quiz client synchronization", () => {
  it("estimates server time from the request midpoint instead of response arrival", () => {
    expect(
      estimateServerOffsetMs(new Date(1_200).toISOString(), 1_000, 1_400),
    ).toBe(0);
    expect(estimateServerOffsetMs("invalid", 1_000, 1_400)).toBeNull();
  });

  it("schedules every state that can advance, including tomorrow after setup or finish", () => {
    expect(liveQuizBoundaryTarget(liveState())).toBe(
      "2026-08-06T04:30:20.000Z",
    );
    expect(
      liveQuizBoundaryTarget(
        liveState({
          phase: "waiting",
          question: null,
          questionNumber: null,
          stage: null,
          stageEndsAt: "2026-08-06T04:30:00.000Z",
        }),
      ),
    ).toBe("2026-08-06T04:30:00.000Z");
    expect(
      liveQuizBoundaryTarget(
        liveState({
          phase: "setup",
          nextStartsAt: "2026-08-07T04:30:00.000Z",
          question: null,
          questionNumber: null,
          stage: null,
        }),
      ),
    ).toBe("2026-08-07T04:30:00.000Z");
    expect(
      liveQuizBoundaryTarget(
        liveState({
          phase: "finished",
          nextStartsAt: "2026-08-07T04:30:00.000Z",
          question: null,
          questionNumber: null,
          stage: null,
        }),
      ),
    ).toBe("2026-08-07T04:30:00.000Z");
  });

  it("accepts only safe counter payloads", () => {
    expect(
      parseLiveQuizRealtimeCounter({
        sessionKey: "2026-08-06",
        questionId: "question-1",
        answerCount: 7,
      }),
    ).toEqual({
      sessionKey: "2026-08-06",
      questionId: "question-1",
      answerCount: 7,
    });
    expect(
      parseLiveQuizRealtimeCounter({
        sessionKey: "2026-08-06",
        questionId: "question-1",
        answerCount: "7",
      }),
    ).toBeNull();
    expect(
      parseLiveQuizRealtimeCounter({
        sessionKey: "2026-08-06",
        questionId: "question-1",
        answerCount: -1,
      }),
    ).toBeNull();
  });

  it("updates only the active session and question and never moves a count backward", () => {
    const state = liveState();
    const advanced = mergeLiveQuizAnswerCount(state, {
      sessionKey: "2026-08-06",
      questionId: "question-1",
      answerCount: 5,
    });
    expect(advanced.activeAnswerCount).toBe(5);
    expect(
      mergeLiveQuizAnswerCount(advanced, {
        sessionKey: "2026-08-06",
        questionId: "question-1",
        answerCount: 4,
      }),
    ).toBe(advanced);
    expect(
      mergeLiveQuizAnswerCount(state, {
        sessionKey: "2026-08-06",
        questionId: "question-2",
        answerCount: 9,
      }),
    ).toBe(state);
  });

  it("merges an event received before the matching snapshot is rendered", () => {
    const state = liveState();
    const counts = new Map([
      [liveQuizCounterKey("2026-08-06", "question-1"), 8],
    ]);
    expect(mergeCachedLiveQuizAnswerCount(state, counts).activeAnswerCount).toBe(8);
  });
});
