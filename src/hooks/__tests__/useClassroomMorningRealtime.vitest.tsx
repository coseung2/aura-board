import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClassroomMorningRealtime } from "../useClassroomMorningRealtime";
import type { ClassroomMorningRealtimeEvent } from "@/lib/realtime";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

function createRealtimeHarness() {
  let broadcast: ((message: { payload: unknown }) => void) | null = null;
  const channel = {
    on: vi.fn(
      (
        _type: string,
        _filter: { event: string },
        callback: (message: { payload: unknown }) => void,
      ) => {
        broadcast = callback;
        return channel;
      },
    ),
    subscribe: vi.fn(() => channel),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };
  createIsolatedClientMock.mockReturnValue(client);

  return {
    channel,
    client,
    emit(event: ClassroomMorningRealtimeEvent) {
      broadcast?.({ payload: event });
    },
  };
}

function morningEvent(
  classroomId = "classroom-a",
): ClassroomMorningRealtimeEvent {
  return {
    type: "morning_changed",
    classroomId,
    changeType: "yellow_card",
    date: "2026-07-10",
    updatedAt: "2026-07-10T01:00:00.000Z",
  };
}

describe("useClassroomMorningRealtime", () => {
  beforeEach(() => {
    createIsolatedClientMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces event bursts, keeps one trailing refresh, and removes its channel", async () => {
    let resolveFirst: (() => void) | null = null;
    const firstRefresh = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const onRefresh = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstRefresh)
      .mockResolvedValue(undefined);
    const { client, emit } = createRealtimeHarness();

    const hook = renderHook(() =>
      useClassroomMorningRealtime({
        classroomId: "classroom-a",
        onRefresh,
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      emit(morningEvent());
      emit(morningEvent());
      emit(morningEvent());
      vi.advanceTimersByTime(79);
    });
    expect(onRefresh).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => {
      emit(morningEvent());
      emit(morningEvent());
    });
    await act(async () => {
      resolveFirst?.();
      await firstRefresh;
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);

    hook.unmount();
    await act(async () => undefined);
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed or differently scoped events", async () => {
    const onRefresh = vi.fn(async () => undefined);
    const { channel, emit } = createRealtimeHarness();

    const hook = renderHook(() =>
      useClassroomMorningRealtime({
        classroomId: "classroom-a",
        onRefresh,
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      emit(morningEvent("classroom-b"));
      const callback = channel.on.mock.calls[0]?.[2];
      callback?.({ payload: { type: "other", classroomId: "classroom-a" } });
      vi.advanceTimersByTime(100);
    });

    expect(onRefresh).not.toHaveBeenCalled();
    hook.unmount();
  });
});
