import { renderHook, waitFor } from "@testing-library/react";
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
});
