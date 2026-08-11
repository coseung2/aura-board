import { describe, expect, it } from "vitest";

import type { LiveQuizStateResponse } from "./contracts";
import {
  createLiveQuizCounterAccumulator,
  estimateServerOffsetMs,
  liveQuizBoundaryTarget,
  mergeLiveQuizCounterShard,
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
        shard: 3,
        answerCount: 7,
      }),
    ).toEqual({
      sessionKey: "2026-08-06",
      questionId: "question-1",
      shard: 3,
      answerCount: 7,
    });
    expect(
      parseLiveQuizRealtimeCounter({
        sessionKey: "2026-08-06",
        questionId: "question-1",
        shard: 3,
        answerCount: "7",
      }),
    ).toBeNull();
    expect(
      parseLiveQuizRealtimeCounter({
        sessionKey: "2026-08-06",
        questionId: "question-1",
        shard: 3,
        answerCount: -1,
      }),
    ).toBeNull();
  });

  it("updates only the active session and question and never moves a count backward", () => {
    const state = liveState();
    const advanced = mergeLiveQuizAnswerCount(state, {
      sessionKey: "2026-08-06",
      questionId: "question-1",
      shard: 3,
      answerCount: 5,
    });
    expect(advanced.activeAnswerCount).toBe(5);
    expect(
      mergeLiveQuizAnswerCount(advanced, {
        sessionKey: "2026-08-06",
        questionId: "question-1",
        shard: 3,
        answerCount: 4,
      }),
    ).toBe(advanced);
    expect(
      mergeLiveQuizAnswerCount(state, {
        sessionKey: "2026-08-06",
        questionId: "question-2",
        shard: 3,
        answerCount: 9,
      }),
    ).toBe(state);
  });

  it("aggregates independent shard updates without moving a shard backward", () => {
    const counters = createLiveQuizCounterAccumulator();
    expect(
      mergeLiveQuizCounterShard(
        {
          sessionKey: "2026-08-06",
          questionId: "question-1",
          shard: 4,
          answerCount: 3,
        },
        counters,
      ),
    ).toBe(3);
    expect(
      mergeLiveQuizCounterShard(
        {
          sessionKey: "2026-08-06",
          questionId: "question-1",
          shard: 9,
          answerCount: 5,
        },
        counters,
      ),
    ).toBe(8);
    expect(
      mergeLiveQuizCounterShard(
        {
          sessionKey: "2026-08-06",
          questionId: "question-1",
          shard: 4,
          answerCount: 2,
        },
        counters,
      ),
    ).toBe(8);
  });

  it("advances a seeded total on the first post-subscribe shard increment", () => {
    const counters = createLiveQuizCounterAccumulator();
    const seeded = [
      { shard: 3, answerCount: 40 },
      { shard: 9, answerCount: 60 },
    ];
    for (const row of seeded) {
      mergeLiveQuizCounterShard(
        {
          sessionKey: "2026-08-06",
          questionId: "question-1",
          ...row,
        },
        counters,
      );
    }
    expect(counters.totals.get("2026-08-06:question-1")).toBe(100);

    const total = mergeLiveQuizCounterShard(
      {
        sessionKey: "2026-08-06",
        questionId: "question-1",
        shard: 9,
        answerCount: 61,
      },
      counters,
    );
    expect(total).toBe(101);
    expect(
      mergeCachedLiveQuizAnswerCount(liveState({ activeAnswerCount: 100 }), counters.totals)
        .activeAnswerCount,
    ).toBe(101);
  });

  it("merges an event received before the matching snapshot is rendered", () => {
    const state = liveState();
    const counts = new Map([
      ["2026-08-06:question-1", 8],
    ]);
    expect(mergeCachedLiveQuizAnswerCount(state, counts).activeAnswerCount).toBe(8);
  });
});
