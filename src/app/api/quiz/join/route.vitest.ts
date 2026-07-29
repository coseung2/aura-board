import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  quizFindUnique: vi.fn(),
  playerFindUnique: vi.fn(),
  playerCreate: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/quiz-realtime-snapshot", () => ({
  publishQuizRealtimeSnapshot: mocks.publish,
}));
vi.mock("@/lib/db", () => ({
  db: {
    quiz: { findUnique: mocks.quizFindUnique },
    quizPlayer: { findUnique: mocks.playerFindUnique, create: mocks.playerCreate },
  },
}));

import { POST } from "./route";
import { verifyQuizPlayerToken } from "@/lib/quiz-player-token";

function join(body: Record<string, unknown>) {
  return POST(new Request("https://example.test/api/quiz/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("quiz join identity binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", name: "세션 학생" });
    mocks.quizFindUnique.mockResolvedValue({
      id: "quiz-1", title: "퀴즈", status: "waiting", questions: [{ id: "q1" }],
    });
    mocks.playerFindUnique.mockResolvedValue(null);
    mocks.playerCreate.mockResolvedValue({
      id: "player-1", quizId: "quiz-1", studentId: "student-1", nickname: "세션 학생", score: 0,
    });
    mocks.publish.mockResolvedValue({ quizId: "quiz-1", players: [] });
  });

  it("allows an anonymous nickname join and returns a bound capability token", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const response = await join({ roomCode: "123456", nickname: "anonymous" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.playerCreate).toHaveBeenCalledWith({
      data: { quizId: "quiz-1", nickname: "anonymous", studentId: null },
    });
    expect(verifyQuizPlayerToken(body.playerToken)).toMatchObject({
      playerId: "player-1",
      quizId: "quiz-1",
    });
  });

  it("rejects a studentId that spoofs another student", async () => {
    const response = await join({ roomCode: "123456", studentId: "student-2" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "student_identity_mismatch" });
    expect(mocks.quizFindUnique).not.toHaveBeenCalled();
  });

  it("creates a player from the authenticated student's id and name", async () => {
    const response = await join({
      roomCode: "123456", studentId: "student-1", nickname: "forged name",
    });
    expect(response.status).toBe(200);
    expect(mocks.playerCreate).toHaveBeenCalledWith({
      data: { quizId: "quiz-1", nickname: "세션 학생", studentId: "student-1" },
    });
    expect(await response.json()).not.toHaveProperty("playerToken");
  });
});
