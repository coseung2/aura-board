import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SpeedGameWire } from "@/components/speed-game/types";

const mocks = vi.hoisted(() => ({
  findGame: vi.fn(),
  authenticate: vi.fn(),
  loadSnapshot: vi.fn(),
  commandRun: vi.fn(),
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
  sanitizeGameSnapshotForStudent: (game: SpeedGameWire) => game,
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
    commandSpeedGameRun: mocks.commandRun,
    loadGameSnapshot: mocks.loadSnapshot,
    SpeedRunCommandError,
    IdempotencyConflictError,
  };
});

import { GET, PATCH } from "./route";
import { SpeedRunCommandError } from "@/lib/speed-game/runtime";

const game: SpeedGameWire = {
  id: "game-1",
  runId: "run-1",
  version: 4,
  terminalReason: null,
  boardId: "board-1",
  boardSlug: "speed-board",
  classroomId: "classroom-1",
  status: "waiting",
  roundIndex: -1,
  answerMode: "normalize-space",
  baseScore: 100,
  minScore: 10,
  bonusRanks: [10, 5],
  timeLimitMs: 30_000,
  rounds: [],
  answers: [],
  groups: [],
  participants: [],
  leaderboard: [],
};

const context = { params: Promise.resolve({ gameId: "game-1" }) };

function patch(body: unknown) {
  return new Request("http://localhost/api/speed-game/games/game-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("speed game run route", () => {
  beforeEach(() => {
    mocks.findGame.mockReset().mockResolvedValue({ boardId: "board-1" });
    mocks.authenticate.mockReset().mockResolvedValue({
      kind: "teacher",
      userId: "teacher-1",
      role: "owner",
    });
    mocks.loadSnapshot.mockReset().mockResolvedValue(game);
    mocks.commandRun.mockReset().mockResolvedValue({
      game: { ...game, status: "active", version: 5 },
      previousVersion: 4,
      version: 5,
      replayed: false,
    });
    mocks.schedule.mockReset();
  });

  it("returns the authoritative current run", async () => {
    const response = await GET(
      new Request("http://localhost/api/speed-game/games/game-1"),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ game });
  });

  it("rejects legacy mutable commands without run identity", async () => {
    const response = await PATCH(patch({ action: "start" }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.commandRun).not.toHaveBeenCalled();
  });

  it("passes requestId, runId, version and actor to the authority service", async () => {
    const response = await PATCH(
      patch({
        requestId: "request-1",
        runId: "run-1",
        expectedVersion: 4,
        action: "start",
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.commandRun).toHaveBeenCalledWith({
      gameId: "game-1",
      runId: "run-1",
      requestId: "request-1",
      expectedVersion: 4,
      action: "start",
      actorSubject: "teacher:teacher-1",
    });
    expect(mocks.schedule).toHaveBeenCalledWith("game-1", "start");
  });

  it("returns the latest snapshot on an optimistic version conflict", async () => {
    mocks.commandRun.mockRejectedValue(
      new SpeedRunCommandError("version_conflict", 409, {
        ...game,
        version: 5,
      }),
    );
    const response = await PATCH(
      patch({
        requestId: "request-stale",
        runId: "run-1",
        expectedVersion: 4,
        action: "next",
      }),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "version_conflict",
      game: { runId: "run-1", version: 5 },
    });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
});
