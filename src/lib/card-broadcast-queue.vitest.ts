import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks = vi.hoisted(
  () => [] as Array<() => void | Promise<void>>,
);
const announce = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  }),
}));
vi.mock("./realtime-broadcast", () => ({ announceCardChange: announce }));

import {
  clearCardBroadcastQueueForTests,
  scheduleCardChangeBroadcast,
} from "./card-broadcast-queue";

function startAfterCallbacks(): Promise<void>[] {
  return afterCallbacks
    .splice(0, afterCallbacks.length)
    .map((callback) => Promise.resolve(callback()));
}

describe("card broadcast queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearCardBroadcastQueueForTests();
    afterCallbacks.length = 0;
    announce.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearCardBroadcastQueueForTests();
    afterCallbacks.length = 0;
    vi.useRealTimers();
  });

  it("coalesces one classroom wave into one board invalidation", async () => {
    scheduleCardChangeBroadcast("board-1", "insert");
    scheduleCardChangeBroadcast("board-1", "update");
    scheduleCardChangeBroadcast("board-2", "insert");
    const completions = startAfterCallbacks();

    await vi.advanceTimersByTimeAsync(500);
    await Promise.all(completions);

    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenCalledWith("board-1", "update", 2);
    expect(announce).toHaveBeenCalledWith("board-2", "insert", 1);
  });
});
