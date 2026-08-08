import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks = vi.hoisted(
  () => [] as Array<() => void | Promise<void>>,
);
const mocks = vi.hoisted(() => ({
  findCards: vi.fn(),
  announceBatch: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  }),
}));
vi.mock("./db", () => ({
  db: { card: { findMany: mocks.findCards } },
}));
vi.mock("./realtime-broadcast", () => ({
  announceEngagementBatchChange: mocks.announceBatch,
}));

import {
  clearEngagementBroadcastQueueForTests,
  engagementBroadcastQueueStateForTests,
  scheduleEngagementBroadcast,
} from "./engagement-broadcast-queue";

function startAfterCallbacks(): Promise<void>[] {
  return afterCallbacks
    .splice(0, afterCallbacks.length)
    .map((callback) => Promise.resolve(callback()));
}

describe("engagement broadcast queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearEngagementBroadcastQueueForTests();
    afterCallbacks.length = 0;
    mocks.findCards.mockResolvedValue([
      {
        id: "card-1",
        boardId: "board-1",
        _count: { likes: 2, comments: 3 },
      },
      {
        id: "card-2",
        boardId: "board-1",
        _count: { likes: 4, comments: 5 },
      },
    ]);
    mocks.announceBatch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearEngagementBroadcastQueueForTests();
    afterCallbacks.length = 0;
    vi.useRealTimers();
  });

  it("loads all counts once and emits one board batch", async () => {
    scheduleEngagementBroadcast("board-1", "card-1", "comment");
    scheduleEngagementBroadcast("board-1", "card-1", "like");
    scheduleEngagementBroadcast("board-1", "card-2", "comment");

    const completions = startAfterCallbacks();
    expect(engagementBroadcastQueueStateForTests().queuedCards).toBe(2);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(completions);

    expect(mocks.findCards).toHaveBeenCalledTimes(1);
    expect(mocks.findCards).toHaveBeenCalledWith({
      where: { id: { in: ["card-1", "card-2"] } },
      select: {
        id: true,
        boardId: true,
        _count: {
          select: {
            likes: true,
            comments: { where: { audience: "public", deletedAt: null } },
          },
        },
      },
    });
    expect(mocks.announceBatch).toHaveBeenCalledTimes(1);
    expect(mocks.announceBatch).toHaveBeenCalledWith("board-1", [
      {
        cardId: "card-1",
        likeCount: 2,
        commentCount: 3,
        changeType: "like",
        changeCount: 2,
      },
      {
        cardId: "card-2",
        likeCount: 4,
        commentCount: 5,
        changeType: "comment",
        changeCount: 1,
      },
    ]);
  });

  it("silently drops cards deleted before the count refresh", async () => {
    mocks.findCards.mockResolvedValue([]);
    scheduleEngagementBroadcast("board-1", "deleted-card", "comment");
    const completions = startAfterCallbacks();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(completions);

    expect(mocks.announceBatch).not.toHaveBeenCalled();
  });
});
