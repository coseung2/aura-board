import { describe, expect, it, vi } from "vitest";
import { subscribeKordleLobbyPresence } from "./lobby-presence";

function fixture() {
  let sync: (() => void) | null = null;
  let status: ((value: string) => void) | null = null;
  let state: Record<string, unknown[]> = {};
  const track = vi.fn().mockResolvedValue("ok");
  const untrack = vi.fn().mockResolvedValue("ok");
  const channel = {
    on: vi.fn((_type: string, _options: unknown, callback: () => void) => {
      sync = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (value: string) => void) => {
      status = callback;
      return channel;
    }),
    track,
    untrack,
    presenceState: vi.fn(() => state),
  };
  const removeChannel = vi.fn().mockResolvedValue("ok");
  const client = {
    channel: vi.fn(() => channel),
    removeChannel,
  };
  return {
    client,
    track,
    untrack,
    removeChannel,
    setState(next: Record<string, unknown[]>) {
      state = next;
    },
    sync() {
      sync?.();
    },
    status(value: string) {
      status?.(value);
    },
  };
}

describe("kordle lobby presence", () => {
  it("tracks only the live student connection and removes it on cleanup", async () => {
    const fake = fixture();
    const changes: unknown[] = [];
    const unsubscribe = subscribeKordleLobbyPresence(
      fake.client as never,
      "board-1",
      { studentId: "student-1", name: "민지" },
      (value) => changes.push(value),
    );

    expect(changes).toEqual([null]);
    fake.status("SUBSCRIBED");
    await Promise.resolve();
    expect(fake.track).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1", name: "민지" }),
    );

    fake.setState({
      one: [
        { studentId: "student-1", name: "민지", gameKind: "kordle", joinedAt: "2026-09-15T00:00:01.000Z" },
      ],
    });
    fake.sync();
    expect(changes.at(-1)).toEqual([
      { studentId: "student-1", name: "민지", gameKind: "kordle", joinedAt: "2026-09-15T00:00:01.000Z" },
    ]);

    unsubscribe();
    expect(fake.untrack).toHaveBeenCalledTimes(1);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("keeps observer failures unknown instead of reporting an empty lobby", () => {
    const fake = fixture();
    const changes: unknown[] = [];
    subscribeKordleLobbyPresence(
      fake.client as never,
      "board-1",
      null,
      (value) => changes.push(value),
    );

    fake.status("SUBSCRIBED");
    expect(fake.track).not.toHaveBeenCalled();
    fake.status("CHANNEL_ERROR");
    expect(changes.at(-1)).toBeNull();
  });
});
