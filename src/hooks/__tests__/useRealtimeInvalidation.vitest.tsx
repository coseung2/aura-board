import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRealtimeInvalidation } from "../useRealtimeInvalidation";

const createIsolatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createIsolatedPublicSupabaseClient: createIsolatedClientMock,
}));

describe("useRealtimeInvalidation", () => {
  afterEach(() => {
    createIsolatedClientMock.mockReset();
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
});
