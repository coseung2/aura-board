import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveIdentities: vi.fn(),
  canManageQuiz: vi.fn(),
  quizFindUnique: vi.fn(),
  playerFindUnique: vi.fn(),
  quizUpdate: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/identity", () => ({ resolveIdentities: mocks.resolveIdentities }));
vi.mock("@/lib/quiz-permissions", () => ({ canManageQuiz: mocks.canManageQuiz }));
vi.mock("@/lib/quiz-realtime-snapshot", () => ({
  publishQuizRealtimeSnapshot: mocks.publish,
}));
vi.mock("@/lib/db", () => ({
  db: {
    quiz: { findUnique: mocks.quizFindUnique, update: mocks.quizUpdate },
    quizPlayer: { findUnique: mocks.playerFindUnique },
  },
}));

import { GET, PATCH } from "./route";

const anon = {
  teacher: null, student: null, parent: null, share: null, primary: "anon",
};
const student = {
  teacher: null,
  student: { studentId: "student-1", name: "학생", classroomId: "class-1" },
  parent: null, share: null, primary: "student",
};
const teacher = {
  teacher: { userId: "teacher-1", name: "선생", ownsBoardIds: new Set<string>() },
  student: null, parent: null, share: null, primary: "teacher",
};
const quiz = {
  id: "quiz-1",
  boardId: "board-1",
  title: "보안 퀴즈",
  status: "active",
  currentQ: 0,
  sourceText: "private source",
  questions: [{ id: "question-1", order: 0, answer: "A", question: "Q" }],
  players: [{ id: "player-1", nickname: "학생", score: 0, studentId: "student-1" }],
};

const context = { params: Promise.resolve({ id: "quiz-1" }) };

describe("quiz detail authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.quizFindUnique.mockResolvedValue(quiz);
    mocks.publish.mockResolvedValue({ quizId: "quiz-1" });
  });

  it("rejects unauthenticated GET and PATCH before database mutation", async () => {
    mocks.resolveIdentities.mockResolvedValue(anon);

    const getResponse = await GET(new Request("https://example.test"), context);
    const patchResponse = await PATCH(
      new Request("https://example.test", {
        method: "PATCH",
        body: JSON.stringify({ action: "start" }),
      }),
      context,
    );

    expect(getResponse.status).toBe(401);
    expect(patchResponse.status).toBe(401);
    expect(mocks.quizFindUnique).not.toHaveBeenCalled();
    expect(mocks.quizUpdate).not.toHaveBeenCalled();
  });

  it("returns a participant view without answer keys or student identifiers", async () => {
    mocks.resolveIdentities.mockResolvedValue(student);
    mocks.canManageQuiz.mockResolvedValue(false);
    mocks.playerFindUnique.mockResolvedValue({ id: "player-1" });

    const response = await GET(new Request("https://example.test"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quiz.questions[0]).not.toHaveProperty("answer");
    expect(body.quiz.players[0]).toMatchObject({ id: "player-1", studentId: null });
  });

  it("rejects an authenticated student who has not joined the quiz", async () => {
    mocks.resolveIdentities.mockResolvedValue(student);
    mocks.canManageQuiz.mockResolvedValue(false);
    mocks.playerFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("https://example.test"), context);
    expect(response.status).toBe(403);
    expect(mocks.quizFindUnique).not.toHaveBeenCalled();
  });

  it("rejects quiz state changes from an authenticated student", async () => {
    mocks.resolveIdentities.mockResolvedValue(student);
    mocks.canManageQuiz.mockResolvedValue(false);

    const response = await PATCH(
      new Request("https://example.test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "finish" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.quizUpdate).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("preserves full management reads and valid editor state changes", async () => {
    mocks.resolveIdentities.mockResolvedValue(teacher);
    mocks.canManageQuiz.mockResolvedValue(true);
    mocks.quizUpdate.mockResolvedValue({ ...quiz, status: "active", currentQ: 0 });

    const getResponse = await GET(new Request("https://example.test"), context);
    expect((await getResponse.json()).quiz.questions[0].answer).toBe("A");

    const patchResponse = await PATCH(
      new Request("https://example.test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }),
      context,
    );
    expect(patchResponse.status).toBe(200);
    expect(mocks.quizUpdate).toHaveBeenCalledWith({
      where: { id: "quiz-1" },
      data: { status: "active", currentQ: 0 },
    });
  });
});
