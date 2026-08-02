import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SpeedGameWire } from "@/components/speed-game/types";

const mocks = vi.hoisted(() => ({
  findGame: vi.fn(),
  authenticate: vi.fn(),
  submitAnswer: vi.fn(),
  reviewAnswer: vi.fn(),
  sanitize: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { speedGame: { findUnique: mocks.findGame } },
}));
vi.mock("@/lib/http-cache", () => ({
  jsonPrivateNoStore: (body: unknown, init?: ResponseInit) =>
    NextResponse.json(body, init),
}));
vi.mock("@/lib/realtime-server", () => ({
  scheduleSpeedGameChange: mocks.schedule,
}));
vi.mock("@/lib/speed-game/student-snapshot", () => ({
  sanitizeGameSnapshotForStudent: mocks.sanitize,
}));
vi.mock("@/lib/speed-game/runtime", () => {
  class SpeedRunCommandError extends Error {
    constructor(
      readonly code: string,
      readonly status = 409,
      readonly snapshot?: SpeedGameWire | null,
    ) {
      super(code);
    }
  }
  class IdempotencyConflictError extends Error {
    readonly status = 409;
    readonly code = "idempotency_key_reuse";
  }
  return {
    authenticateGameViewer: mocks.authenticate,
    submitSpeedGameAnswer: mocks.submitAnswer,
    reviewSpeedGameAnswer: mocks.reviewAnswer,
    SpeedRunCommandError,
    IdempotencyConflictError,
  };
});

import { PATCH, POST } from "./route";
import { SpeedRunCommandError } from "@/lib/speed-game/runtime";

const game: SpeedGameWire = {
  id: "game-1",
  runId: "run-1",
  version: 4,
  terminalReason: null,
  boardId: "board-1",
  boardSlug: "speed-board",
  classroomId: "classroom-1",
  status: "active",
  roundIndex: 0,
  answerMode: "exact",
  baseScore: 1000,
  minScore: 0,
  bonusRanks: [300, 200, 100],
  timeLimitMs: 30_000,
  rounds: [],
  answers: [],
  groups: [],
  participants: [],
  leaderboard: [],
};

const context = { params: Promise.resolve({ gameId: "game-1" }) };

function request(body: unknown, method = "POST") {
  return new Request("https://example.test/api/speed-game/games/game-1/answer", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const submitBody = {
  requestId: "request-1",
  runId: "run-1",
  expectedVersion: 4,
  answer: "Cat",
  roundId: "round-1",
  groupId: "group-1",
};

describe("speed game answer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findGame.mockResolvedValue({ boardId: "board-1" });
    mocks.authenticate.mockResolvedValue({
      kind: "student",
      studentId: "student-1",
      classroomId: "classroom-1",
    });
    mocks.sanitize.mockImplementation((snapshot: SpeedGameWire) => snapshot);
    mocks.submitAnswer.mockResolvedValue({
      game,
      answer: { id: "answer-1", answer: "Cat", elapsedMs: 2000, score: 1200 },
      previousVersion: 4,
      version: 5,
      replayed: false,
      resultId: null,
    });
    mocks.reviewAnswer.mockResolvedValue({
      game: { ...game, version: 5 },
      previousVersion: 4,
      version: 5,
      replayed: false,
    });
  });

  it("passes only server-owned command fields to the authoritative runtime", async () => {
    const response = await POST(request(submitBody), context);

    expect(response.status).toBe(200);
    expect(mocks.submitAnswer).toHaveBeenCalledWith({
      gameId: "game-1",
      runId: "run-1",
      requestId: "request-1",
      expectedVersion: 4,
      studentId: "student-1",
      actorSubject: "student:student-1",
      rawText: "Cat",
      roundId: "round-1",
      groupId: "group-1",
      receivedAt: expect.any(Date),
    });
    expect(mocks.sanitize).toHaveBeenCalledWith(game, "student-1");
    expect(mocks.schedule).toHaveBeenCalledWith("game-1", "answer");
  });

  it("rejects legacy client timing and score fields", async () => {
    const response = await POST(
      request({ ...submitBody, elapsedMs: 0, score: 999999 }),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
  });

  it("does not publish another invalidation for a receipt replay", async () => {
    mocks.submitAnswer.mockResolvedValue({
      game,
      answer: { id: "answer-1" },
      previousVersion: 4,
      version: 5,
      replayed: true,
      resultId: null,
    });

    const response = await POST(request(submitBody), context);

    expect(response.status).toBe(200);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("returns the authoritative snapshot on an optimistic conflict", async () => {
    mocks.submitAnswer.mockRejectedValue(
      new SpeedRunCommandError("version_conflict", 409, {
        ...game,
        version: 5,
      }),
    );

    const response = await POST(request(submitBody), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "version_conflict",
      game: { runId: "run-1", version: 5 },
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("requires a student identity for answer submission", async () => {
    mocks.authenticate.mockResolvedValue({
      kind: "teacher",
      userId: "teacher-1",
      role: "owner",
    });

    const response = await POST(request(submitBody), context);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "student_required" });
    expect(mocks.submitAnswer).not.toHaveBeenCalled();
  });

  it("allows an editor to review an answer through the authoritative runtime", async () => {
    mocks.authenticate.mockResolvedValue({
      kind: "teacher",
      userId: "teacher-1",
      role: "editor",
    });

    const response = await PATCH(
      request(
        {
          requestId: "review-1",
          runId: "run-1",
          expectedVersion: 4,
          answerId: "answer-1",
          decision: "accepted",
        },
        "PATCH",
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.reviewAnswer).toHaveBeenCalledWith({
      gameId: "game-1",
      runId: "run-1",
      answerId: "answer-1",
      requestId: "review-1",
      expectedVersion: 4,
      decision: "accepted",
      actorSubject: "teacher:teacher-1",
    });
    expect(mocks.schedule).toHaveBeenCalledWith("game-1", "answer-review");
  });
});
