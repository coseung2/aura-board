import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBoardEngagement,
  type BoardEngagementEvent,
} from "../useBoardEngagementRealtime";

const subscribeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/realtime-channel-registry", () => ({
  subscribePublicBroadcast: subscribeMock,
}));

function createRealtimeHarness() {
  let broadcast:
    | ((message: { event: string; payload?: BoardEngagementEvent }) => void)
    | null = null;
  const unsubscribe = vi.fn();
  subscribeMock.mockImplementation(
    (options: {
      channelName: string;
      events: string[];
      onMessage: (message: { event: string; payload?: BoardEngagementEvent }) => void;
    }) => {
      expect(options.channelName).toBe("board:board-a");
      expect(options.events).toEqual(["board_changed"]);
      broadcast = options.onMessage;
      return unsubscribe;
    },
  );
  return {
    unsubscribe,
    broadcast: (event: BoardEngagementEvent) =>
      broadcast?.({ event: "board_changed", payload: event }),
  };
}

describe("useBoardEngagement realtime ownership", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one logical board listener and releases it after the last card", async () => {
    const realtime = createRealtimeHarness();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const first = renderHook(() =>
      useBoardEngagement("board-a", "card-a", firstListener),
    );
    const second = renderHook(() =>
      useBoardEngagement("board-a", "card-b", secondListener),
    );

    await waitFor(() => expect(subscribeMock).toHaveBeenCalledTimes(1));

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
    expect(realtime.unsubscribe).not.toHaveBeenCalled();
    second.unmount();
    expect(realtime.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
