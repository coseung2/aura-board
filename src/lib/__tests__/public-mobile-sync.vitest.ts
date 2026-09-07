import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardSyncController } from "../../../apps/mobile/lib/board-sync-controller";
import { createReloadRunner, type BoardRealtimeSubscriber } from "../../../apps/mobile/lib/board-realtime-core";
import { PUBLIC_SYNC_LAYOUTS } from "../../../apps/mobile/lib/public-sync-layouts";
import { availableLayoutKeys } from "../product-release";

function harness() {
  let listener!: BoardRealtimeSubscriber;
  const unsubscribe = vi.fn();
  const reload = vi.fn(async () => undefined);
  const subscribe = vi.fn(async (subscriber: BoardRealtimeSubscriber) => {
    listener = subscriber;
    return { status: "connecting" as const, unsubscribe };
  });
  const controller = createBoardSyncController({ subscribe, onReload: reload, onStatus: vi.fn(), fallbackPollMs: 15_000 });
  return { controller, reload, subscribe, unsubscribe, get listener() { return listener; } };
}

describe("public mobile synchronization lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("covers exactly the ordinary-user readable layouts, not pilot-only games", () => {
    expect([...PUBLIC_SYNC_LAYOUTS].sort()).toEqual(availableLayoutKeys().sort());
  });

  it("reconciles a short background gap and does not poll or fetch while backgrounded", async () => {
    vi.useFakeTimers();
    const h = harness();
    await vi.advanceTimersByTimeAsync(0);
    h.listener.onStatus("subscribed");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.reload).toHaveBeenCalledTimes(1);
    h.controller.setActive(false);
    h.listener.onEvent();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.reload).toHaveBeenCalledTimes(1);
    h.controller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.reload).toHaveBeenCalledTimes(2);
    h.controller.setActive(false);
    h.listener.onStatus("error");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.reload).toHaveBeenCalledTimes(2);
    h.controller.dispose();
    expect(h.unsubscribe).toHaveBeenCalledOnce();
  });

  it("polls only until healthy and reconciles on reconnect", async () => {
    vi.useFakeTimers();
    const h = harness();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(h.reload).toHaveBeenCalledOnce();
    h.listener.onStatus("subscribed");
    await vi.advanceTimersByTimeAsync(1);
    const count = h.reload.mock.calls.length;
    await vi.advanceTimersByTimeAsync(45_000);
    expect(h.reload).toHaveBeenCalledTimes(count);
    h.listener.onStatus("error");
    await vi.advanceTimersByTimeAsync(15_001);
    expect(h.reload).toHaveBeenCalledTimes(count + 1);
    h.listener.onStatus("subscribed");
    await vi.advanceTimersByTimeAsync(1);
    expect(h.reload).toHaveBeenCalledTimes(count + 2);
    h.controller.dispose();
  });

  it("retries missing runtime configuration instead of permanently caching unavailability", async () => {
    vi.useFakeTimers();
    const subscribe = vi.fn(async () => null);
    const controller = createBoardSyncController({ subscribe, onReload: vi.fn(), onStatus: vi.fn() });
    await vi.advanceTimersByTimeAsync(15_001);
    expect(subscribe).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("retries a failed HTTP refresh even with a healthy subscription", async () => {
    vi.useFakeTimers();
    const h = harness();
    await vi.advanceTimersByTimeAsync(0);
    h.reload.mockRejectedValueOnce(new Error("temporary HTTP failure"));
    h.listener.onStatus("subscribed");
    await vi.advanceTimersByTimeAsync(1_002);
    expect(h.reload).toHaveBeenCalledTimes(2);
    h.controller.dispose();
  });

  it("cleans up a late connection after unmount without issuing a read", async () => {
    vi.useFakeTimers();
    let resolve!: (value: { status: "subscribed"; unsubscribe: () => void }) => void;
    const unsubscribe = vi.fn();
    const onReload = vi.fn();
    const controller = createBoardSyncController({ subscribe: () => new Promise((done) => { resolve = done; }), onReload, onStatus: vi.fn() });
    controller.dispose();
    resolve({ status: "subscribed", unsubscribe });
    await vi.advanceTimersByTimeAsync(1);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(onReload).not.toHaveBeenCalled();
  });

  it("retains one follow-up read after an event arrives during a slow snapshot", async () => {
    vi.useFakeTimers();
    const h = harness();
    await vi.advanceTimersByTimeAsync(0);
    let release!: () => void;
    h.reload.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    h.listener.onEvent();
    await vi.advanceTimersByTimeAsync(100);
    h.listener.onEvent();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.reload).toHaveBeenCalledOnce();
    release();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.reload).toHaveBeenCalledTimes(2);
    h.controller.dispose();
  });

  it("cannot starve refresh indefinitely during a continuous event stream", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const runner = createReloadRunner(reload);
    for (let i = 0; i < 12; i++) { runner.reload(); await vi.advanceTimersByTimeAsync(50); }
    expect(reload).toHaveBeenCalled();
    runner.dispose();
  });
});
