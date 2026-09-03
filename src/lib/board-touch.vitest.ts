import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateMany: vi.fn(),
  createEvent: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/identity", () => ({
  resolveIdentities: vi.fn().mockResolvedValue({
    teacher: { userId: "teacher-1" },
    student: null,
  }),
}));

import { touchBoardUpdatedAt } from "./board-touch";

describe("touchBoardUpdatedAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ id: "board-1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.createEvent.mockResolvedValue({ id: "event-1" });
    mocks.transaction.mockImplementation(
      async (
        operation: (tx: {
          board: { update: typeof mocks.update; updateMany: typeof mocks.updateMany };
          boardActivityEvent: { create: typeof mocks.createEvent };
        }) => Promise<unknown>,
      ) =>
        operation({
          board: { update: mocks.update, updateMany: mocks.updateMany },
          boardActivityEvent: { create: mocks.createEvent },
        }),
    );
  });

  it("preserves the exact timestamp path when coalescing is disabled", async () => {
    await touchBoardUpdatedAt("board-1", {
      action: "section.updated",
      actorType: "teacher",
      actorId: "teacher-1",
    });

    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "board-1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("appends every event but conditionally touches the shared board row", async () => {
    await touchBoardUpdatedAt("board-1", {
      action: "comment.created",
      actorType: "student",
      actorId: "student-1",
      coalesceMs: 1_000,
    });

    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "board-1",
        updatedAt: { lt: expect.any(Date) },
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.createEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateMany.mock.invocationCallOrder[0],
    );
  });

  it("fills the actor from the request identity when callers omit it", async () => {
    await touchBoardUpdatedAt("board-1", { action: "card.moved" });

    expect(mocks.createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: "teacher",
        actorId: "teacher-1",
      }),
    });
  });
});
