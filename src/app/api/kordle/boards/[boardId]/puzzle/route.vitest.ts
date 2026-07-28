import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentGuessIndex: 1,
  findPuzzle: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  announce: vi.fn(),
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
vi.mock("@/lib/db", () => {
  const tx = {
    kordlePuzzle: {
      findFirst: mocks.findPuzzle,
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
      update: vi.fn(),
    },
  };
  return {
    db: {
      board: { findFirst: vi.fn(async () => ({ id: "board-1" })) },
      $transaction: vi.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    },
  };
});

import { PATCH } from "./route";

const context = { params: Promise.resolve({ boardId: "board-1" }) };

function advanceRequest(expectedGuessIndex?: number) {
  return new Request("http://localhost/api/kordle/boards/board-1/puzzle", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "advance",
      puzzleId: "puzzle-1",
      ...(expectedGuessIndex === undefined ? {} : { expectedGuessIndex }),
    }),
  });
}

describe("Kordle puzzle advancement", () => {
  beforeEach(() => {
    mocks.currentGuessIndex = 1;
    mocks.findPuzzle.mockReset();
    mocks.findPuzzle.mockResolvedValue({
      id: "puzzle-1",
      gameId: "game-1",
      status: "LIVE",
      currentGuessIndex: 1,
      game: { maxGuesses: 6 },
    });
    mocks.updateMany.mockReset();
    mocks.updateMany.mockImplementation(
      async ({ where }: { where: { currentGuessIndex: number } }) => {
        if (where.currentGuessIndex !== mocks.currentGuessIndex) return { count: 0 };
        mocks.currentGuessIndex += 1;
        return { count: 1 };
      },
    );
    mocks.findUnique.mockReset();
    mocks.findUnique.mockImplementation(async () => ({
      id: "puzzle-1",
      status: "LIVE",
      startsAt: new Date("2026-07-28T00:00:00.000Z"),
      currentGuessIndex: mocks.currentGuessIndex,
    }));
    mocks.announce.mockReset();
    mocks.announce.mockResolvedValue(undefined);
  });

  it("advances once when the expected guess index matches", async () => {
    const response = await PATCH(advanceRequest(1), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      puzzle: { id: "puzzle-1", currentGuessIndex: 2 },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "puzzle-1",
          status: "LIVE",
          currentGuessIndex: 1,
        }),
      }),
    );
  });

  it("returns one deterministic conflict for concurrent stale advances without skipping", async () => {
    const responses = await Promise.all([
      PATCH(advanceRequest(1), context),
      PATCH(advanceRequest(1), context),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    const conflict = responses.find((response) => response.status === 409);

    expect(statuses).toEqual([200, 409]);
    expect(conflict).toBeDefined();
    expect(await conflict!.json()).toEqual({ error: "stale_puzzle_advance" });
    expect(mocks.currentGuessIndex).toBe(2);
    expect(mocks.announce).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy advance requests race-safe by inferring the current index", async () => {
    const responses = await Promise.all([
      PATCH(advanceRequest(), context),
      PATCH(advanceRequest(), context),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mocks.currentGuessIndex).toBe(2);
  });
});
