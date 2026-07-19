import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  speedGameFindUnique: vi.fn(),
  boardFindUnique: vi.fn(),
  speedGameRoundFindFirst: vi.fn(),
  answerFindUnique: vi.fn(),
  answerFindMany: vi.fn(),
  transaction: vi.fn(),
  answerUpsert: vi.fn(),
  speedGameUpdate: vi.fn(),
  resolveStudentGroupId: vi.fn(),
  limitSpeedGameAnswer: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    speedGame: {
      findUnique: mocks.speedGameFindUnique,
    },
    board: {
      findUnique: mocks.boardFindUnique,
    },
    speedGameRound: {
      findFirst: mocks.speedGameRoundFindFirst,
    },
    speedGameAnswer: {
      findUnique: mocks.answerFindUnique,
      findMany: mocks.answerFindMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));
vi.mock("@/lib/speed-game/runtime", () => ({
  resolveStudentGroupId: mocks.resolveStudentGroupId,
}));
vi.mock("@/lib/rate-limit-routes", () => ({
  limitSpeedGameAnswer: mocks.limitSpeedGameAnswer,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://example.test/api/speed-game/games/game-1/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupValidAnswer() {
  mocks.getCurrentStudent.mockResolvedValue({
    id: "student-1",
    classroomId: "classroom-1",
  });
  mocks.speedGameFindUnique.mockResolvedValue({
    id: "game-1",
    boardId: "board-1",
    status: "running",
    roundIndex: 0,
    answerMode: "exact",
    baseScore: 1000,
    minScore: 0,
    bonusRanks: "300,200,100",
  });
  mocks.boardFindUnique.mockResolvedValue({ classroomId: "classroom-1" });
  mocks.resolveStudentGroupId.mockResolvedValue("group-1");
  mocks.speedGameRoundFindFirst.mockResolvedValue({
    id: "round-1",
    keyword: "Cat",
    keywordNormalized: "cat",
    startedAt: new Date("2026-07-20T00:00:00.000Z"),
  });
  mocks.answerFindUnique.mockResolvedValue(null);
  mocks.answerFindMany.mockResolvedValue([]);
  mocks.limitSpeedGameAnswer.mockResolvedValue({ ok: true, retryAfter: 0 });
}

describe("POST /api/speed-game/games/[gameId]/answer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupValidAnswer();
  });

  it("returns 429 with Retry-After before any write when limited", async () => {
    mocks.limitSpeedGameAnswer.mockResolvedValue({ ok: false, retryAfter: 19 });

    const response = await POST(
      request({ roundId: "round-1", groupId: "group-1", answer: "Cat", elapsedMs: 250 }),
      { params: Promise.resolve({ gameId: "game-1" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("19");
    expect(await response.json()).toMatchObject({
      error: "rate_limited",
      retryAfter: 19,
    });
    expect(mocks.limitSpeedGameAnswer).toHaveBeenCalledWith("game-1", "student-1");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.answerUpsert).not.toHaveBeenCalled();
  });

  it("touches SpeedGame.updatedAt in the same transaction as the answer upsert", async () => {
    const calls: string[] = [];
    const createdAt = new Date("2026-07-20T00:00:02.000Z");
    mocks.answerUpsert.mockImplementation(async () => {
      calls.push("answer");
      return {
        id: "answer-1",
        correct: true,
        score: 1000,
        approval: "accepted",
        elapsedMs: 250,
        createdAt,
      };
    });
    mocks.speedGameUpdate.mockImplementation(async () => {
      calls.push("game");
      return { id: "game-1" };
    });
    const tx = {
      speedGameAnswer: {
        findUnique: mocks.answerFindUnique,
        findMany: mocks.answerFindMany,
        upsert: mocks.answerUpsert,
      },
      speedGame: { update: mocks.speedGameUpdate },
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    const response = await POST(
      request({ roundId: "round-1", groupId: "group-1", answer: "Cat", elapsedMs: 250 }),
      { params: Promise.resolve({ gameId: "game-1" }) },
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(["answer", "game"]);
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" },
    );
    expect(mocks.speedGameUpdate).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(await response.json()).toMatchObject({
      answer: {
        id: "answer-1",
        roundId: "round-1",
        groupId: "group-1",
        studentId: "student-1",
        answer: "Cat",
        correct: true,
        score: 1000,
      },
    });
  });

  it("retries a serializable transaction conflict", async () => {
    const createdAt = new Date("2026-07-20T00:00:02.000Z");
    mocks.answerUpsert.mockResolvedValue({
      id: "answer-1",
      correct: true,
      score: 1000,
      approval: "accepted",
      elapsedMs: 250,
      createdAt,
    });
    mocks.speedGameUpdate.mockResolvedValue({ id: "game-1" });
    const tx = {
      speedGameAnswer: {
        findUnique: mocks.answerFindUnique,
        findMany: mocks.answerFindMany,
        upsert: mocks.answerUpsert,
      },
      speedGame: { update: mocks.speedGameUpdate },
    };
    mocks.transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      );

    const response = await POST(
      request({ roundId: "round-1", groupId: "group-1", answer: "Cat", elapsedMs: 250 }),
      { params: Promise.resolve({ gameId: "game-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.answerUpsert).toHaveBeenCalledTimes(1);
  });
});
