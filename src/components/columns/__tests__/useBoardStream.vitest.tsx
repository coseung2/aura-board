import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardStream } from "../useBoardStream";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

function createRealtimeHarness() {
  let subscribeCallback: ((status: string) => void) | null = null;
  const broadcastHandlers = new Map<string, () => void>();
  const channel = {
    on: vi.fn(
      (
        _type: string,
        filter: { event: string },
        callback: () => void,
      ) => {
        broadcastHandlers.set(filter.event, callback);
        return channel;
      },
    ),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscribeCallback = callback;
      queueMicrotask(() => subscribeCallback?.("SUBSCRIBED"));
      return channel;
    }),
    track: vi.fn(),
    untrack: vi.fn(),
    presenceState: vi.fn(),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };
  createIsolatedClientMock.mockReturnValue(client);
  return {
    channel,
    client,
    emit(event = "card_changed") {
      broadcastHandlers.get(event)?.();
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
    createIsolatedClientMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps Presence hidden and removes its isolated Broadcast channel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 304, ok: false })),
    );
    const { channel, client } = createRealtimeHarness();
    const hook = renderBoardStream();

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledTimes(1));
    expect(hook.result.current).toEqual({
      status: "unavailable",
      presence: {
        onlineCount: 0,
        otherOnlineCount: 0,
        remoteWorkingCount: 0,
      },
    });
    expect(channel.track).not.toHaveBeenCalled();
    expect(channel.untrack).not.toHaveBeenCalled();

    hook.unmount();
    await waitFor(() => expect(client.removeChannel).toHaveBeenCalledWith(channel));
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
    const { channel, client } = createRealtimeHarness();
    const setCards = vi.fn();
    const setSections = vi.fn();
    const hook = renderBoardStream(setCards, setSections);

    await act(async () => undefined);
    resolveSnapshot({
      status: 403,
      ok: false,
      json: async () => ({ cards: [{ id: "stale" }], sections: [] }),
    });
    await waitFor(() => expect(client.removeChannel).toHaveBeenCalledWith(channel));
    expect(setCards).not.toHaveBeenCalled();
    expect(setSections).not.toHaveBeenCalled();

    hook.unmount();
    await act(async () => undefined);
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });
});
