import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardSnapshotRealtime } from "../useBoardSnapshotRealtime";

const subscribeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/realtime-channel-registry", () => ({
  subscribePublicBroadcast: subscribeMock,
}));

const EVENTS = ["queue_changed"];

type Subscription = {
  channelName: string;
  events: string[];
  onMessage: (message: { event: string; payload?: unknown }) => void;
  onStatus: (status: string) => void;
};

function createRealtimeHarness() {
  const subscriptions: Subscription[] = [];
  const unsubscriptions: ReturnType<typeof vi.fn>[] = [];
  subscribeMock.mockImplementation((options: Subscription) => {
    subscriptions.push(options);
    const unsubscribe = vi.fn();
    unsubscriptions.push(unsubscribe);
    return unsubscribe;
  });
  return {
    subscriptions,
    unsubscriptions,
    latest() {
      const subscription = subscriptions.at(-1);
      if (!subscription) throw new Error("subscription not registered");
      return subscription;
    },
  };
}

describe("useBoardSnapshotRealtime ownership", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 304, ok: false })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("owns and cleans up a shared board-topic subscription", async () => {
    const realtime = createRealtimeHarness();

    const hook = renderHook(() =>
      useBoardSnapshotRealtime("board-a", EVENTS, vi.fn()),
    );

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(1));
    expect(realtime.latest().channelName).toBe("board:board-a");
    expect(realtime.latest().events).toEqual(EVENTS);

    hook.unmount();
    expect(realtime.unsubscriptions[0]).toHaveBeenCalledTimes(1);
  });

  it("fetches and applies the initial snapshot without waiting for Realtime", async () => {
    createRealtimeHarness();
    const snapshot = { hash: "hash-a", cards: [{ id: "card-a" }] };
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => snapshot,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const apply = vi.fn();

    const hook = renderHook(() =>
      useBoardSnapshotRealtime("board-a", EVENTS, apply),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-a/snapshot",
      { cache: "no-store" },
    );
    expect(apply).toHaveBeenCalledWith(snapshot);

    hook.unmount();
  });

  it("uses fallback polling only while the board channel is unavailable", async () => {
    vi.useFakeTimers();
    const realtime = createRealtimeHarness();
    const response = {
      status: 200,
      ok: true,
      json: async () => ({ hash: "hash-a" }),
    };
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    const apply = vi.fn();

    const hook = renderHook(() =>
      useBoardSnapshotRealtime("board-a", EVENTS, apply),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => realtime.latest().onStatus("CHANNEL_ERROR"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    act(() => realtime.latest().onStatus("SUBSCRIBED"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    hook.unmount();
  });

  it("does not apply a stale response after boardId changes", async () => {
    createRealtimeHarness();
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondSnapshot = { hash: "hash-b", cards: [{ id: "card-b" }] };
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => secondSnapshot,
      });
    vi.stubGlobal("fetch", fetchMock);
    const apply = vi.fn();

    const hook = renderHook(
      ({ boardId }: { boardId: string }) =>
        useBoardSnapshotRealtime(boardId, EVENTS, apply),
      { initialProps: { boardId: "board-a" } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    hook.rerender({ boardId: "board-b" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    resolveFirst({
      status: 200,
      ok: true,
      json: async () => ({ hash: "hash-a", cards: [{ id: "card-a" }] }),
    } as Response);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(apply).not.toHaveBeenCalledWith(
      expect.objectContaining({ hash: "hash-a" }),
    );
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith(secondSnapshot),
    );

    hook.unmount();
  });
});
