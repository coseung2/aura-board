import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardSnapshotRealtime } from "../useBoardSnapshotRealtime";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

const EVENTS = ["queue_changed"];

describe("useBoardSnapshotRealtime ownership", () => {
  beforeEach(() => {
    createIsolatedClientMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 304, ok: false })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("owns and cleans up an isolated client for the board topic", async () => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    };
    createIsolatedClientMock.mockReturnValue(client);

    const hook = renderHook(() =>
      useBoardSnapshotRealtime("board-a", EVENTS, vi.fn()),
    );

    await waitFor(() => {
      expect(createIsolatedClientMock).toHaveBeenCalledTimes(1);
      expect(client.channel).toHaveBeenCalledWith("board:board-a");
      expect(channel.subscribe).toHaveBeenCalledTimes(1);
    });

    hook.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("fetches and applies the initial snapshot without waiting for Realtime", async () => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    };
    createIsolatedClientMock.mockReturnValue(client);
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
    let statusListener: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((listener: (status: string) => void) => {
        statusListener = listener;
        return channel;
      }),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    };
    createIsolatedClientMock.mockReturnValue(client);
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
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => statusListener?.("CHANNEL_ERROR"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    act(() => statusListener?.("SUBSCRIBED"));
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
