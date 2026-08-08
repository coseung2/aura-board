import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardStream } from "../useBoardStream";

const subscribeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/realtime-channel-registry", () => ({
  subscribePublicBroadcast: subscribeMock,
}));

function createRealtimeHarness() {
  let subscription:
    | {
        channelName: string;
        events: string[];
        onMessage: (message: { event: string }) => void;
        onStatus: (status: string) => void;
      }
    | null = null;
  const unsubscribe = vi.fn();
  subscribeMock.mockImplementation(
    (options: {
      channelName: string;
      events: string[];
      onMessage: (message: { event: string }) => void;
      onStatus: (status: string) => void;
    }) => {
      subscription = options;
      queueMicrotask(() => options.onStatus("SUBSCRIBED"));
      return unsubscribe;
    },
  );
  return {
    unsubscribe,
    emit(event = "card_changed") {
      subscription?.onMessage({ event });
    },
    get subscription() {
      if (!subscription) throw new Error("subscription not registered");
      return subscription;
    },
  };
}

function renderBoardStream(
  setCards = vi.fn(),
  setSections = vi.fn(),
) {
  return renderHook(() =>
    useBoardStream({
      boardId: "board-a",
      currentUserId: "user-a",
      activity: { mode: "browsing" },
      pendingCardIds: { current: new Set<string>() },
      setCards,
      setSections,
    }),
  );
}

describe("useBoardStream Broadcast lifecycle", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps Presence hidden and releases its shared Broadcast subscription", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 304, ok: false })),
    );
    const realtime = createRealtimeHarness();
    const hook = renderBoardStream();

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(1));
    expect(realtime.subscription.channelName).toBe("board:board-a");
    expect(realtime.subscription.events).toEqual(["card_changed"]);
    expect(hook.result.current).toEqual({
      status: "unavailable",
      presence: {
        onlineCount: 0,
        otherOnlineCount: 0,
        remoteWorkingCount: 0,
      },
    });

    hook.unmount();
    expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst and keeps one trailing snapshot during an inflight read", async () => {
    vi.useFakeTimers();
    let resolveInflight!: (value: {
      status: number;
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    const inflight = new Promise<{
      status: number;
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveInflight = resolve;
    });
    let requestCount = 0;
    const fetchMock = vi.fn(() => {
      requestCount += 1;
      if (requestCount <= 2) {
        return Promise.resolve({ status: 304, ok: false });
      }
      if (requestCount === 3) return inflight;
      return Promise.resolve({ status: 304, ok: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const harness = createRealtimeHarness();
    renderBoardStream();

    await act(async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => {
      harness.emit();
      harness.emit();
      harness.emit();
      vi.advanceTimersByTime(80);
    });
    await act(async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    act(() => {
      harness.emit();
      vi.advanceTimersByTime(80);
    });
    resolveInflight({
      status: 200,
      ok: true,
      json: async () => ({ cards: [], sections: [], hash: "next" }),
    });
    await act(async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shuts down once on authorization loss and ignores the stale response", async () => {
    let resolveSnapshot!: (value: {
      status: number;
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    const snapshot = new Promise<{
      status: number;
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      resolveSnapshot = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => snapshot));
    const realtime = createRealtimeHarness();
    const setCards = vi.fn();
    const setSections = vi.fn();
    const hook = renderBoardStream(setCards, setSections);

    await act(async () => undefined);
    resolveSnapshot({
      status: 403,
      ok: false,
      json: async () => ({ cards: [{ id: "stale" }], sections: [] }),
    });
    await waitFor(() => expect(realtime.unsubscribe).toHaveBeenCalledTimes(1));
    expect(setCards).not.toHaveBeenCalled();
    expect(setSections).not.toHaveBeenCalled();

    hook.unmount();
    await act(async () => undefined);
    expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
