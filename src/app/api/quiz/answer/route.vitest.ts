import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  publish: vi.fn(),
}));

const runtime = vi.hoisted(() => {
  const state = {
    question: { id: "question-1", quizId: "quiz-1", answer: "A" },
    player: { id: "player-1", quizId: "quiz-1", studentId: "student-1", score: 0 },
    quiz: {
      status: "active", currentQ: 0,
      questions: [{ id: "question-1" }, { id: "question-2" }],
    },
    existing: null as null | { id: string },
  };
  const tx = {
    quizQuestion: { findUnique: vi.fn(async () => state.question) },
    quizPlayer: {
      findUnique: vi.fn(async () => state.player),
      update: vi.fn(async ({ data }: { data: { score: { increment: number } } }) => {
        state.player.score += data.score.increment;
        return state.player;
      }),
    },
    quizAnswer: {
      findUnique: vi.fn(async () => state.existing),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "answer-1", ...data })),
    },
    quiz: { findUnique: vi.fn(async () => state.quiz) },
  };
  return {
    state,
    tx,
    db: { $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) },
    reset() {
      state.question = { id: "question-1", quizId: "quiz-1", answer: "A" };
      state.player = { id: "player-1", quizId: "quiz-1", studentId: "student-1", score: 0 };
      state.quiz = {
        status: "active", currentQ: 0,
        questions: [{ id: "question-1" }, { id: "question-2" }],
      };
      state.existing = null;
    },
  };
});

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/quiz-realtime-snapshot", () => ({
  publishQuizRealtimeSnapshot: mocks.publish,
}));
vi.mock("@/lib/db", () => ({ db: runtime.db }));

import { POST } from "./route";
import { issueQuizPlayerToken } from "@/lib/quiz-player-token";

function answer(overrides: Record<string, unknown> = {}) {
  return POST(new Request("https://example.test/api/quiz/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      questionId: "question-1", playerId: "player-1", selected: "A", timeMs: 100, ...overrides,
    }),
  }));
}

describe("quiz answer integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.reset();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", name: "학생" });
    mocks.publish.mockResolvedValue({ quizId: "quiz-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires an authenticated student and player ownership", async () => {
    mocks.getCurrentStudent.mockResolvedValueOnce(null);
    expect((await answer()).status).toBe(403);

    mocks.getCurrentStudent.mockResolvedValueOnce({ id: "student-2" });
    const forged = await answer();
    expect(forged.status).toBe(403);
    expect(await forged.json()).toEqual({ error: "Player not owned" });
  });

  it("accepts a valid capability for an anonymous player", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    runtime.state.player.studentId = null;
    const playerToken = issueQuizPlayerToken("player-1", "quiz-1").token;

    const response = await answer({ playerToken });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ correct: true, points: 995 });
  });

  it("rejects a missing or wrongly bound anonymous capability", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    runtime.state.player.studentId = null;

    const missing = await answer();
    expect(missing.status).toBe(403);

    const wrongPlayer = issueQuizPlayerToken("player-2", "quiz-1").token;
    const wrong = await answer({ playerToken: wrongPlayer });
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: "Player not owned" });

    const wrongQuiz = issueQuizPlayerToken("player-1", "quiz-2").token;
    const wrongQuizResponse = await answer({ playerToken: wrongQuiz });
    expect(wrongQuizResponse.status).toBe(403);
  });

  it("rejects an expired anonymous capability", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T00:00:00.000Z"));
    mocks.getCurrentStudent.mockResolvedValue(null);
    runtime.state.player.studentId = null;
    const playerToken = issueQuizPlayerToken("player-1", "quiz-1").token;
    vi.setSystemTime(new Date("2026-07-28T03:00:00.000Z"));

    const response = await answer({ playerToken });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Player not owned" });
  });

  it("rejects a player and question from different quizzes", async () => {
    runtime.state.player.quizId = "quiz-2";
    const response = await answer();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Quiz mismatch" });
  });

  it("rejects inactive and stale question submissions", async () => {
    runtime.state.quiz.status = "waiting";
    const inactive = await answer();
    expect(inactive.status).toBe(409);
    expect(await inactive.json()).toEqual({ error: "Quiz not active" });

    runtime.state.quiz.status = "active";
    runtime.state.quiz.currentQ = 1;
    const stale = await answer();
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "Question not current" });
  });

  it("rejects replayed answers deterministically", async () => {
    runtime.state.existing = { id: "answer-old" };
    const response = await answer();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Already answered" });
  });

  it("stores and scores a valid current answer", async () => {
    const response = await answer();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ correct: true, correctAnswer: "A", points: 995 });
    expect(runtime.tx.quizAnswer.create).toHaveBeenCalledWith({
      data: {
        questionId: "question-1", playerId: "player-1", selected: "A",
        correct: true, timeMs: 100,
      },
    });
    expect(mocks.publish).toHaveBeenCalledWith("quiz-1");
  });
});
