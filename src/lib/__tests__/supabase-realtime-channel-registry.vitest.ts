import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createPublicClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createPublicSupabaseClient: createPublicClientMock,
}));

import {
  clearPublicBroadcastRegistryForTests,
  subscribePublicBroadcast,
} from "@/lib/supabase/realtime-channel-registry";

function createRealtimeHarness() {
  let broadcast: ((message: { event: string; payload?: unknown }) => void) | null = null;
  let statusListener: ((status: string) => void) | null = null;
  const channel = {
    on: vi.fn(
      (
        _type: string,
        filter: { event: string },
        listener: (message: { event: string; payload?: unknown }) => void,
      ) => {
        expect(filter).toEqual({ event: "*" });
        broadcast = listener;
        return channel;
      },
    ),
    subscribe: vi.fn((listener: (status: string) => void) => {
      statusListener = listener;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };
  createPublicClientMock.mockReturnValue(client);
  return {
    channel,
    client,
    emit(event: string, payload: unknown) {
      broadcast?.({ event, payload });
    },
    status(status: string) {
      statusListener?.(status);
    },
  };
}

describe("public Supabase Broadcast registry", () => {
  beforeEach(async () => {
    await clearPublicBroadcastRegistryForTests();
    createPublicClientMock.mockReset();
  });

  afterEach(async () => {
    await clearPublicBroadcastRegistryForTests();
  });

  it("shares one client/channel per topic and removes it after the last listener", async () => {
    const realtime = createRealtimeHarness();
    const cardListener = vi.fn();
    const engagementListener = vi.fn();
    const firstStatus = vi.fn();
    const secondStatus = vi.fn();

    const unsubscribeCard = subscribePublicBroadcast({
      channelName: "board:board-a",
      events: ["card_changed"],
      onMessage: cardListener,
      onStatus: firstStatus,
    });
    const unsubscribeEngagement = subscribePublicBroadcast({
      channelName: "board:board-a",
      events: ["board_changed"],
      onMessage: engagementListener,
      onStatus: secondStatus,
    });

    await vi.waitFor(() => {
      expect(createPublicClientMock).toHaveBeenCalledTimes(1);
      expect(realtime.client.channel).toHaveBeenCalledTimes(1);
      expect(realtime.client.channel).toHaveBeenCalledWith("board:board-a");
      expect(realtime.channel.on).toHaveBeenCalledTimes(1);
      expect(realtime.channel.subscribe).toHaveBeenCalledTimes(1);
    });

    realtime.status("SUBSCRIBED");
    expect(firstStatus).toHaveBeenCalledWith("SUBSCRIBED");
    expect(secondStatus).toHaveBeenCalledWith("SUBSCRIBED");

    realtime.emit("card_changed", { id: "card-a" });
    expect(cardListener).toHaveBeenCalledTimes(1);
    expect(engagementListener).not.toHaveBeenCalled();

    realtime.emit("board_changed", { id: "card-a" });
    expect(engagementListener).toHaveBeenCalledTimes(1);
    expect(cardListener).toHaveBeenCalledTimes(1);

    unsubscribeCard();
    expect(realtime.client.removeChannel).not.toHaveBeenCalled();
    unsubscribeEngagement();
    await vi.waitFor(() => {
      expect(realtime.client.removeChannel).toHaveBeenCalledTimes(1);
      expect(realtime.client.removeChannel).toHaveBeenCalledWith(realtime.channel);
    });
  });

  it("replays the current channel status to a later subscriber", async () => {
    const realtime = createRealtimeHarness();
    const unsubscribeFirst = subscribePublicBroadcast({
      channelName: "board:board-a",
      events: ["card_changed"],
      onMessage: vi.fn(),
    });
    await vi.waitFor(() => expect(realtime.channel.subscribe).toHaveBeenCalledTimes(1));
    realtime.status("SUBSCRIBED");

    const laterStatus = vi.fn();
    const unsubscribeLater = subscribePublicBroadcast({
      channelName: "board:board-a",
      events: ["queue_changed"],
      onMessage: vi.fn(),
      onStatus: laterStatus,
    });
    expect(laterStatus).toHaveBeenCalledWith("SUBSCRIBED");

    unsubscribeFirst();
    unsubscribeLater();
  });
});
