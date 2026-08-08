import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks = vi.hoisted(
  () => [] as Array<() => void | Promise<void>>,
);
const mocks = vi.hoisted(() => ({
  findBoards: vi.fn(),
  createManyEvents: vi.fn(),
  updateManyBoards: vi.fn(),
  transaction: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  }),
}));
vi.mock("./board-snapshot-cache", () => ({
  invalidateBoardSnapshotCache: mocks.invalidate,
}));
vi.mock("./db", () => ({
  db: {
    board: {
      findMany: mocks.findBoards,
      updateMany: mocks.updateManyBoards,
    },
    boardActivityEvent: { createMany: mocks.createManyEvents },
    $transaction: mocks.transaction,
  },
}));

import {
  boardActivityQueueStateForTests,
  clearBoardActivityQueueForTests,
  scheduleBoardActivity,
} from "./board-activity-queue";

async function startAfterCallbacks(): Promise<void>[] {
  return afterCallbacks
    .splice(0, afterCallbacks.length)
    .map((callback) => Promise.resolve(callback()));
}

describe("batched board activity queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearBoardActivityQueueForTests();
    afterCallbacks.length = 0;
    mocks.findBoards.mockResolvedValue([{ id: "board-1" }, { id: "board-2" }]);
    mocks.createManyEvents.mockReturnValue(Promise.resolve({ count: 0 }));
    mocks.updateManyBoards.mockReturnValue(Promise.resolve({ count: 0 }));
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });

  afterEach(() => {
    clearBoardActivityQueueForTests();
    afterCallbacks.length = 0;
    vi.useRealTimers();
  });

  it("preserves every event while touching each board once per batch", async () => {
    scheduleBoardActivity("board-1", {
      action: "card.created",
      actorType: "student",
      actorId: "student-1",
      coalesceMs: 1_000,
    });
    scheduleBoardActivity("board-1", {
      action: "comment.created",
      actorType: "student",
      actorId: "student-2",
      coalesceMs: 1_000,
    });
    scheduleBoardActivity("board-2", {
      action: "like.created",
      actorType: "student",
      actorId: "student-3",
      coalesceMs: 1_000,
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(3);

    const completions = await startAfterCallbacks();
    expect(boardActivityQueueStateForTests().queued).toBe(3);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(completions);

    expect(mocks.findBoards).toHaveBeenCalledWith({
      where: { id: { in: ["board-1", "board-2"] } },
      select: { id: true },
    });
    expect(mocks.createManyEvents).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ boardId: "board-1", action: "card.created" }),
        expect.objectContaining({ boardId: "board-1", action: "comment.created" }),
        expect.objectContaining({ boardId: "board-2", action: "like.created" }),
      ]),
    });
    expect(mocks.createManyEvents.mock.calls[0]![0].data).toHaveLength(3);
    expect(mocks.updateManyBoards).toHaveBeenCalledTimes(1);
    expect(mocks.updateManyBoards).toHaveBeenCalledWith({
      where: {
        id: { in: ["board-1", "board-2"] },
        updatedAt: { lt: expect.any(Date) },
      },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it("drops events for a board deleted before the delayed flush", async () => {
    mocks.findBoards.mockResolvedValue([{ id: "board-1" }]);
    scheduleBoardActivity("board-1", { action: "card.created", coalesceMs: 1_000 });
    scheduleBoardActivity("deleted-board", {
      action: "card.created",
      coalesceMs: 1_000,
    });

    const completions = await startAfterCallbacks();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(completions);

    expect(mocks.createManyEvents.mock.calls[0]![0].data).toHaveLength(1);
    expect(mocks.createManyEvents.mock.calls[0]![0].data[0]).toMatchObject({
      boardId: "board-1",
    });
  });
});
