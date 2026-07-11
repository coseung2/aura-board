import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBoardEngagement,
  type BoardEngagementEvent,
} from "../useBoardEngagementRealtime";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

function createRealtimeHarness() {
  let broadcast:
    | ((message: { payload?: BoardEngagementEvent }) => void)
    | null = null;
  const channel = {
    on: vi.fn(
      (
        _kind: string,
        _filter: { event: string },
        callback: (message: { payload?: BoardEngagementEvent }) => void,
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
    broadcast: (event: BoardEngagementEvent) => broadcast?.({ payload: event }),
  };
}

describe("useBoardEngagement realtime ownership", () => {
  beforeEach(() => {
    createIsolatedClientMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one isolated board client and removes it after the last listener", async () => {
    const realtime = createRealtimeHarness();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const first = renderHook(() =>
      useBoardEngagement("board-a", "card-a", firstListener),
    );
    const second = renderHook(() =>
      useBoardEngagement("board-a", "card-b", secondListener),
    );

    await waitFor(() => {
      expect(createIsolatedClientMock).toHaveBeenCalledTimes(1);
      expect(realtime.client.channel).toHaveBeenCalledWith("board:board-a");
    });

    act(() => {
      realtime.broadcast({
        type: "engagement_changed",
        boardId: "board-a",
        cardId: "card-a",
        likeCount: 3,
        commentCount: 2,
        changeType: "like",
        updatedAt: "2026-07-10T00:00:00.000Z",
      });
    });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).not.toHaveBeenCalled();

    first.unmount();
    expect(realtime.client.removeChannel).not.toHaveBeenCalled();
    second.unmount();
    expect(realtime.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(realtime.client.removeChannel).toHaveBeenCalledWith(realtime.channel);
  });
});
