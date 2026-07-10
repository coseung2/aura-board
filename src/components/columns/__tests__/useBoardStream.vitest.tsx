import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardStream } from "../useBoardStream";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

type TrackStatus = "ok" | "error" | "timed out";

function createRealtimeHarness(statuses: TrackStatus[]) {
  let subscribeCallback: ((status: string) => void) | null = null;
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscribeCallback = callback;
      queueMicrotask(() => subscribeCallback?.("SUBSCRIBED"));
      return channel;
    }),
    track: vi.fn(async () => statuses.shift() ?? "ok"),
    untrack: vi.fn(async () => "ok"),
    presenceState: vi.fn(() => ({})),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };
  createIsolatedClientMock.mockReturnValue(client);
  return { channel, client };
}

function renderBoardStream() {
  return renderHook(() =>
    useBoardStream({
      boardId: "board-a",
      currentUserId: "user-a",
      activity: { mode: "browsing" },
      pendingCardIds: { current: new Set<string>() },
      setCards: vi.fn(),
      setSections: vi.fn(),
    }),
  );
}

describe("useBoardStream Presence lifecycle", () => {
  beforeEach(() => {
    createIsolatedClientMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 304, ok: false })),
    );
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns a dedicated client and only becomes live after track succeeds", async () => {
    const { channel, client } = createRealtimeHarness(["error", "ok"]);
    const hook = renderBoardStream();

    await waitFor(() => expect(channel.track).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.status).toBe("reconnecting"));
    await waitFor(
      () => {
        expect(channel.track).toHaveBeenCalledTimes(2);
        expect(hook.result.current.status).toBe("live");
      },
      { timeout: 1_500 },
    );

    expect(createIsolatedClientMock).toHaveBeenCalledTimes(1);
    hook.unmount();
    await act(async () => undefined);
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("bounds retries when track keeps returning non-ok statuses", async () => {
    const { channel } = createRealtimeHarness([
      "timed out",
      "error",
      "timed out",
      "error",
    ]);
    const hook = renderBoardStream();

    await waitFor(
      () => {
        expect(channel.track).toHaveBeenCalledTimes(4);
        expect(hook.result.current.status).toBe("unavailable");
      },
      { timeout: 3_000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(channel.track).toHaveBeenCalledTimes(4);
    hook.unmount();
  });
});
