import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRealtimeInvalidation } from "../useRealtimeInvalidation";

const subscribeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/realtime-channel-registry", () => ({
  subscribePublicBroadcast: subscribeMock,
}));

type Subscription = {
  channelName: string;
  events: string[];
  onMessage: (message: { event: string; payload?: unknown }) => void;
  onStatus: (status: string) => void;
};

function createSubscriptionHarness() {
  let subscription: Subscription | null = null;
  const unsubscribe = vi.fn();
  subscribeMock.mockImplementation((options: Subscription) => {
    subscription = options;
    return unsubscribe;
  });
  return {
    unsubscribe,
    get subscription() {
      if (!subscription) throw new Error("subscription not registered");
      return subscription;
    },
  };
}

describe("useRealtimeInvalidation", () => {
  afterEach(() => {
    subscribeMock.mockReset();
    vi.useRealTimers();
  });

  it("refreshes immediately without waiting for the Realtime subscription", async () => {
    const realtime = createSubscriptionHarness();
    const refresh = vi.fn(async () => undefined);

    const hook = renderHook(() =>
      useRealtimeInvalidation({
        channelName: "board:board-a",
        event: "card_changed",
        refresh,
      }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(realtime.subscription.channelName).toBe("board:board-a");
    expect(realtime.subscription.events).toEqual(["card_changed"]);

    hook.unmount();
    expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("registers every Broadcast event with the shared topic listener", async () => {
    const realtime = createSubscriptionHarness();
    const refresh = vi.fn(async () => undefined);

    const hook = renderHook(() =>
      useRealtimeInvalidation({
        channelName: "board:board-a",
        event: ["card_changed", "queue_changed"],
        refresh,
        debounceMs: 0,
      }),
    );

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(1));
    expect(realtime.subscription.events).toEqual(["card_changed", "queue_changed"]);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    refresh.mockClear();
    act(() => realtime.subscription.onMessage({ event: "card_changed" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    refresh.mockClear();
    act(() => realtime.subscription.onMessage({ event: "queue_changed" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    hook.unmount();
  });

  it("starts fallback polling on an unavailable channel and stops after subscribe", async () => {
    vi.useFakeTimers();
    const realtime = createSubscriptionHarness();
    const refresh = vi.fn(async () => undefined);

    const hook = renderHook(() =>
      useRealtimeInvalidation({
        channelName: "board:board-a",
        event: "card_changed",
        refresh,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => realtime.subscription.onStatus("CHANNEL_ERROR"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(refresh).toHaveBeenCalledTimes(3);

    act(() => realtime.subscription.onStatus("SUBSCRIBED"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(refresh).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(refresh).toHaveBeenCalledTimes(4);

    hook.unmount();
  });

  it("falls back when subscribe never reports a status", async () => {
    vi.useFakeTimers();
    createSubscriptionHarness();
    const refresh = vi.fn(async () => undefined);

    const hook = renderHook(() =>
      useRealtimeInvalidation({
        channelName: "board:board-a",
        event: "card_changed",
        refresh,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    hook.unmount();
  });
});
