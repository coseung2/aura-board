import { describe, expect, it } from "vitest";
import {
  buildQuizPresencePayload,
  countQuizPresence,
  parseQuizRealtimeSnapshot,
  quizChannelKey,
} from "../realtime";

describe("quiz realtime", () => {
  it("builds the quiz-scoped channel key", () => {
    expect(quizChannelKey("quiz-1")).toBe("quiz:quiz-1");
  });

  it("accepts a safe committed snapshot", () => {
    const snapshot = parseQuizRealtimeSnapshot({
      version: 1,
      quizId: "quiz-1",
      status: "active",
      currentQuestionIndex: 0,
      totalQuestions: 2,
      currentQuestion: {
        id: "question-1",
        index: 0,
        total: 2,
        text: "2 + 2?",
        options: ["1", "2", "3", "4"],
        timeLimit: 20,
      },
      players: [{ id: "player-1", nickname: "민수", score: 1000 }],
      distribution: { A: 0, B: 0, C: 0, D: 1 },
      totalAnswers: 1,
      updatedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(snapshot?.currentQuestion?.options).toEqual(["1", "2", "3", "4"]);
    expect(snapshot?.players[0]?.score).toBe(1000);
  });

  it("rejects malformed or answer-leaking snapshots", () => {
    expect(
      parseQuizRealtimeSnapshot({
        version: 1,
        quizId: "quiz-1",
        status: "active",
        currentQuestionIndex: 0,
        totalQuestions: 1,
        currentQuestion: {
          id: "question-1",
          index: 0,
          total: 1,
          text: "질문",
          options: ["A", "B", "C", "D"],
          timeLimit: 20,
          answer: "D",
        },
        players: [],
        distribution: { A: 0, B: 0, C: 0 },
        totalAnswers: 0,
        updatedAt: "2026-07-10T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("deduplicates visible anonymous presence actors", () => {
    const visible = buildQuizPresencePayload({
      actorKey: "actor-a",
      visible: true,
      joinedAt: "2026-07-10T00:00:00.000Z",
      now: "2026-07-10T00:00:01.000Z",
    });
    const hidden = buildQuizPresencePayload({
      actorKey: "actor-b",
      visible: false,
      joinedAt: "2026-07-10T00:00:00.000Z",
      now: "2026-07-10T00:00:01.000Z",
    });

    expect(
      countQuizPresence({
        tab1: [visible],
        tab2: [{ ...visible, updatedAt: "2026-07-10T00:00:02.000Z" }],
        tab3: [hidden],
        malformed: [{ actorKey: "actor-c", visible: true }],
      }),
    ).toBe(1);
    expect(visible).not.toHaveProperty("playerId");
    expect(visible).not.toHaveProperty("nickname");
    expect(visible).not.toHaveProperty("studentId");
  });
});
