import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRealtimeInvalidation } from "../useRealtimeInvalidation";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

describe("useRealtimeInvalidation", () => {
  afterEach(() => {
    createIsolatedClientMock.mockReset();
    vi.useRealTimers();
  });

  it("refreshes immediately without waiting for the Realtime subscription", async () => {
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    };
    createIsolatedClientMock.mockReturnValue(client);
    const refresh = vi.fn(async () => undefined);

    const hook = renderHook(() =>
      useRealtimeInvalidation({
        channelName: "board:board-a",
        event: "card_changed",
        refresh,
      }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    hook.unmount();
    await waitFor(() => expect(client.removeChannel).toHaveBeenCalledWith(channel));
  });

  it("registers one Broadcast listener for every event", async () => {
    const listeners = new Map<string, () => void>();
    const channel = {
      on: vi.fn(
        (
          _type: string,
          options: { event: string },
          listener: () => void,
        ) => {
          listeners.set(options.event, listener);
          return channel;
        },
      ),
      subscribe: vi.fn().mockReturnThis(),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    };
    createIsolatedClientMock.mockReturnValue(client);
    const refresh = vi.fn(async () => undefined);

    const hook = renderHook(() =>
      useRealtimeInvalidation({
        channelName: "board:board-a",
        event: ["card_changed", "queue_changed"],
        refresh,
        debounceMs: 0,
      }),
    );

    await waitFor(() => expect(channel.on).toHaveBeenCalledTimes(2));
    expect(channel.on.mock.calls.map(([, options]) => options)).toEqual([
      { event: "card_changed" },
      { event: "queue_changed" },
    ]);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    refresh.mockClear();
    act(() => listeners.get("card_changed")?.());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    refresh.mockClear();
    act(() => listeners.get("queue_changed")?.());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    hook.unmount();
  });

  it("starts fallback polling on an unavailable channel and stops after subscribe", async () => {
    vi.useFakeTimers();
    let statusListener: ((status: string) => void) | undefined;
    const channel = {
      on: vi.fn().mockReturnThis(),
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
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => statusListener?.("CHANNEL_ERROR"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refresh).toHaveBeenCalledTimes(3);

    act(() => statusListener?.("SUBSCRIBED"));
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
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    createIsolatedClientMock.mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    });
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
