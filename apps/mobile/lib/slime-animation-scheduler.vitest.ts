import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelSlimeAnimationSchedule,
  getSlimeAnimationSchedulerSnapshotForTests,
  resetSlimeAnimationSchedulerForTests,
  scheduleSlimeAnimationInterval,
  scheduleSlimeAnimationTimeout,
} from "./slime-animation-scheduler";

describe("slime animation scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    resetSlimeAnimationSchedulerForTests();
  });

  afterEach(() => {
    resetSlimeAnimationSchedulerForTests();
    vi.useRealTimers();
  });

  it("fires concurrent subscribers in due-time order with one underlying timer", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const order: string[] = [];

    scheduleSlimeAnimationTimeout(30, () => {
      order.push("second");
    });
    scheduleSlimeAnimationTimeout(10, () => {
      order.push("first");
    });
    scheduleSlimeAnimationTimeout(30, () => {
      order.push("third");
    });

    // Re-arming may call setTimeout more than once while subscribers are added,
    // but steady state keeps exactly one native timer for all pending work.
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 3,
      hasActiveTimer: true,
      nextDueAt: Date.now() + 10,
    });
    const armedBeforeFlush = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => typeof delay === "number",
    );
    expect(armedBeforeFlush.at(-1)?.[1]).toBe(10);

    vi.advanceTimersByTime(10);
    expect(order).toEqual(["first"]);
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 2,
      hasActiveTimer: true,
      nextDueAt: Date.now() + 20,
    });

    vi.advanceTimersByTime(20);
    expect(order).toEqual(["first", "second", "third"]);
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 0,
      hasActiveTimer: false,
      nextDueAt: null,
    });
  });

  it("cancels a pending callback before it fires and re-arms for the next due entry", () => {
    const order: string[] = [];
    const early = scheduleSlimeAnimationTimeout(15, () => {
      order.push("early");
    });
    scheduleSlimeAnimationTimeout(40, () => {
      order.push("late");
    });

    cancelSlimeAnimationSchedule(early);
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 1,
      hasActiveTimer: true,
      nextDueAt: Date.now() + 40,
    });

    vi.advanceTimersByTime(40);
    expect(order).toEqual(["late"]);
  });

  it("reschedules one-shot work after a callback and keeps interval cadence independent", () => {
    const frames: number[] = [];
    const wheels: number[] = [];
    let frame = 0;

    const tickFrame = () => {
      frame += 1;
      frames.push(frame);
      if (frame < 3) {
        scheduleSlimeAnimationTimeout(25, tickFrame);
      }
    };

    scheduleSlimeAnimationTimeout(25, tickFrame);
    scheduleSlimeAnimationInterval(40, () => {
      wheels.push(wheels.length + 1);
    });

    // Shared timer only: both the frame clock and wheel clock are pending.
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 2,
      hasActiveTimer: true,
    });

    vi.advanceTimersByTime(25);
    expect(frames).toEqual([1]);
    expect(wheels).toEqual([]);

    vi.advanceTimersByTime(15);
    expect(frames).toEqual([1]);
    expect(wheels).toEqual([1]);

    vi.advanceTimersByTime(10);
    expect(frames).toEqual([1, 2]);

    vi.advanceTimersByTime(30);
    expect(frames).toEqual([1, 2, 3]);
    expect(wheels).toEqual([1, 2]);

    // Interval continues after one-shot frame work completes.
    vi.advanceTimersByTime(40);
    expect(wheels).toEqual([1, 2, 3]);
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 1,
      hasActiveTimer: true,
    });
  });

  it("cancels an interval on unmount-style cleanup", () => {
    const ticks: number[] = [];
    const handle = scheduleSlimeAnimationInterval(20, () => {
      ticks.push(ticks.length + 1);
    });

    vi.advanceTimersByTime(40);
    expect(ticks).toEqual([1, 2]);

    cancelSlimeAnimationSchedule(handle);
    vi.advanceTimersByTime(100);
    expect(ticks).toEqual([1, 2]);
    expect(getSlimeAnimationSchedulerSnapshotForTests()).toMatchObject({
      pendingCount: 0,
      hasActiveTimer: false,
    });
  });
});
