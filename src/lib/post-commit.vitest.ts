import { afterEach, describe, expect, it, vi } from "vitest";

const afterCallbacks = vi.hoisted(
  () => [] as Array<() => void | Promise<void>>,
);

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  }),
}));

import {
  postCommitQueueStateForTests,
  schedulePostCommit,
} from "./post-commit";

function startAfterCallbacks(): Promise<void>[] {
  return afterCallbacks
    .splice(0, afterCallbacks.length)
    .map((callback) => Promise.resolve(callback()));
}

describe("schedulePostCommit", () => {
  afterEach(() => {
    afterCallbacks.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("defers the task until the current request stack has returned", async () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => undefined);

    schedulePostCommit("test", task);
    expect(task).not.toHaveBeenCalled();

    const completions = startAfterCallbacks();
    await vi.runAllTimersAsync();
    await Promise.all(completions);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("contains post-commit failures", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    schedulePostCommit("broken", async () => {
      throw new Error("failed");
    });
    const completions = startAfterCallbacks();
    await vi.runAllTimersAsync();
    await Promise.all(completions);

    expect(error).toHaveBeenCalledWith(
      "[post-commit] broken failed",
      { error: "failed" },
    );
  });

  it("bounds simultaneous background work", async () => {
    const { maxConcurrency } = postCommitQueueStateForTests();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let running = 0;
    let peak = 0;
    let completed = 0;

    for (let index = 0; index < maxConcurrency + 4; index += 1) {
      schedulePostCommit(`bounded-${index}`, async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate;
        running -= 1;
        completed += 1;
      });
    }

    const completions = startAfterCallbacks();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(peak).toBe(maxConcurrency);
    expect(postCommitQueueStateForTests()).toMatchObject({
      active: maxConcurrency,
      queued: 4,
    });

    release();
    await Promise.all(completions);
    expect(completed).toBe(maxConcurrency + 4);
    expect(postCommitQueueStateForTests()).toMatchObject({ active: 0, queued: 0 });
  });
});
