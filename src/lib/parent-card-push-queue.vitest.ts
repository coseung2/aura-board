import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks = vi.hoisted(
  () => [] as Array<() => void | Promise<void>>,
);
const dispatchBatch = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  }),
}));
vi.mock("./parent-push", () => ({
  dispatchLinkedParentCardPushBatch: dispatchBatch,
}));

import {
  clearParentCardPushQueueForTests,
  parentCardPushQueueStateForTests,
  scheduleLinkedParentCardPush,
} from "./parent-card-push-queue";

function startAfterCallbacks(): Promise<void>[] {
  return afterCallbacks
    .splice(0, afterCallbacks.length)
    .map((callback) => Promise.resolve(callback()));
}

describe("parent card push queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearParentCardPushQueueForTests();
    afterCallbacks.length = 0;
    dispatchBatch.mockResolvedValue({ attempted: 0, skipped: 0 });
  });

  afterEach(() => {
    clearParentCardPushQueueForTests();
    afterCallbacks.length = 0;
    vi.useRealTimers();
  });

  it("resolves parent links once for a short card wave", async () => {
    const first = {
      eventKey: "card:card-1",
      studentId: "student-1",
      studentName: "하늘",
      boardId: "board-1",
      cardId: "card-1",
    };
    const second = {
      eventKey: "card:card-2",
      studentId: "student-2",
      studentName: "바다",
      boardId: "board-1",
      cardId: "card-2",
    };
    scheduleLinkedParentCardPush(first);
    scheduleLinkedParentCardPush(second);
    const completions = startAfterCallbacks();

    expect(parentCardPushQueueStateForTests().queued).toBe(2);
    await vi.advanceTimersByTimeAsync(750);
    await Promise.all(completions);

    expect(dispatchBatch).toHaveBeenCalledTimes(1);
    expect(dispatchBatch).toHaveBeenCalledWith([first, second]);
  });
});
