import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentGuessIndex: 1,
  version: BigInt(3),
  findPuzzle: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  announce: vi.fn(),
  queryRaw: vi.fn(),
  withReceipt: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "teacher-1" })),
}));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: vi.fn() }));
vi.mock("@/lib/http-cache", () => ({ jsonPrivateNoStore: vi.fn() }));
vi.mock("@/lib/realtime-broadcast", () => ({
  announceKordlePuzzleChange: mocks.announce,
}));
vi.mock("@/features/kordle/engine", () => ({ normalizeWord: vi.fn() }));
vi.mock("@/features/kordle/server/kordleWords", () => ({
  KORDLE_WORD_LENGTH: 5,
  resolveRandomKordleSolution: vi.fn(),
}));
vi.mock("@/features/kordle/server/kordleServer", () => ({
  closeKordlePuzzleAttempts: vi.fn(),
}));
vi.mock("@/lib/game-platform/idempotency", () => ({
  IdempotencyConflictError: class IdempotencyConflictError extends Error {
    status = 409;
    code = "idempotency_key_reuse";
  },
  withPlayRequestReceipt: mocks.withReceipt,
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    kordlePuzzle: {
      findFirst: mocks.findPuzzle,
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
      update: vi.fn(),
      findMany: vi.fn(async () => []),
    },
  };
  return {
    db: {
      board: {
        findFirst: vi.fn(async () => ({ id: "board-1", title: "꼬들" })),
      },
      $transaction: vi.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    },
  };
});

import { PATCH } from "./route";

const context = { params: Promise.resolve({ boardId: "board-1" }) };

function advanceRequest(input: {
  requestId: string;
  expectedVersion?: number;
  expectedGuessIndex?: number;
}) {
  return new Request("http://localhost/api/kordle/boards/board-1/puzzle", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: input.requestId,
      ...(input.expectedVersion === undefined
        ? {}
        : { expectedVersion: input.expectedVersion }),
      action: "advance",
      puzzleId: "puzzle-1",
      ...(input.expectedGuessIndex === undefined
        ? {}
        : { expectedGuessIndex: input.expectedGuessIndex }),
    }),
  });
}

describe("Kordle versioned puzzle advancement", () => {
  beforeEach(() => {
    mocks.currentGuessIndex = 1;
    mocks.version = BigInt(3);
    mocks.queryRaw.mockReset().mockResolvedValue([{ id: "puzzle-1" }]);
    mocks.withReceipt.mockReset().mockImplementation(
      async (
        _tx: unknown,
        _input: unknown,
        execute: () => Promise<unknown>,
      ) => ({ response: await execute(), replayed: false }),
    );
    mocks.findPuzzle.mockReset().mockImplementation(async () => ({
      id: "puzzle-1",
      gameId: "game-1",
      status: "LIVE",
      version: mocks.version,
      startsAt: new Date("2026-07-28T00:00:00.000Z"),
      endsAt: null,
      currentGuessIndex: mocks.currentGuessIndex,
      game: { maxGuesses: 6 },
    }));
    mocks.updateMany.mockReset().mockImplementation(
      async ({ where }: { where: { currentGuessIndex: number; version: bigint } }) => {
        if (
          where.currentGuessIndex !== mocks.currentGuessIndex ||
          where.version !== mocks.version
        ) {
          return { count: 0 };
        }
        mocks.currentGuessIndex += 1;
        mocks.version += BigInt(1);
        return { count: 1 };
      },
    );
    mocks.findUnique.mockReset().mockImplementation(async () => ({
      id: "puzzle-1",
      status: "LIVE",
      version: mocks.version,
      startsAt: new Date("2026-07-28T00:00:00.000Z"),
      endsAt: null,
      currentGuessIndex: mocks.currentGuessIndex,
    }));
    mocks.announce.mockReset().mockResolvedValue(undefined);
  });

  it("advances once when both expected version and line match", async () => {
    const response = await PATCH(
      advanceRequest({
        requestId: "advance-1",
        expectedVersion: 3,
        expectedGuessIndex: 1,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      requestId: "advance-1",
      previousVersion: 3,
      version: 4,
      puzzle: { id: "puzzle-1", currentGuessIndex: 2, version: 4 },
    });
    expect(mocks.withReceipt).toHaveBeenCalledBefore(mocks.findPuzzle);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "puzzle-1",
          status: "LIVE",
          version: BigInt(3),
          currentGuessIndex: 1,
        }),
      }),
    );
  });

  it("returns one deterministic conflict for concurrent stale advances", async () => {
    const responses = await Promise.all([
      PATCH(
        advanceRequest({
          requestId: "advance-a",
          expectedVersion: 3,
          expectedGuessIndex: 1,
        }),
        context,
      ),
      PATCH(
        advanceRequest({
          requestId: "advance-b",
          expectedVersion: 3,
          expectedGuessIndex: 1,
        }),
        context,
      ),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect(await conflict.json()).toMatchObject({
      ok: false,
      error: "version_conflict",
      puzzle: { version: 4, currentGuessIndex: 2 },
    });
    expect(mocks.currentGuessIndex).toBe(2);
    expect(mocks.version).toBe(BigInt(4));
    expect(mocks.announce).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy commands without the request envelope", async () => {
    const response = await PATCH(
      advanceRequest({ requestId: "legacy-without-version" }),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.withReceipt).not.toHaveBeenCalled();
  });
});
