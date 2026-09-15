import { describe, expect, it, vi } from "vitest";
import {
  gamePresenceChannelKey,
  normalizeGamePresence,
  subscribeGamePresence,
} from "./presence";

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
  const client = { channel: vi.fn(() => channel), removeChannel };
  return {
    client,
    track,
    untrack,
    removeChannel,
    setState(next: Record<string, unknown[]>) { state = next; },
    sync() { sync?.(); },
    status(value: string) { status?.(value); },
  };
}

describe("game presence", () => {
  it("uses a game-scoped ephemeral channel", () => {
    expect(gamePresenceChannelKey("board", "board-1")).toBe("game:presence:board:board-1");
  });

  it("dedupes multiple connections by student while keeping first arrival", () => {
    expect(normalizeGamePresence({
      a: [
        { studentId: "s1", name: "가", gameKind: "omok", joinedAt: "2026-09-15T00:00:02.000Z" },
        { studentId: "s2", name: "나", gameKind: "omok", joinedAt: "2026-09-15T00:00:03.000Z" },
      ],
      b: [
        { studentId: "s1", name: "가", gameKind: "omok", joinedAt: "2026-09-15T00:00:01.000Z" },
        { studentId: "", name: "무효", gameKind: "omok", joinedAt: "2026-09-15T00:00:00.000Z" },
      ],
    })).toEqual([
      { studentId: "s1", name: "가", gameKind: "omok", joinedAt: "2026-09-15T00:00:01.000Z" },
      { studentId: "s2", name: "나", gameKind: "omok", joinedAt: "2026-09-15T00:00:03.000Z" },
    ]);
  });

  it("tracks students, leaves observers untracked, and untracks on cleanup", async () => {
    const fake = fixture();
    const changes: unknown[] = [];
    const unsubscribe = subscribeGamePresence(fake.client as never, {
      scopeKind: "board",
      gameKind: "kordle",
      scopeId: "board-1",
      self: { studentId: "s1", name: "민지" },
      onChange: (value) => changes.push(value),
    });
    expect(fake.client.channel).toHaveBeenCalledWith(
      "game:presence:board:board-1",
      expect.objectContaining({ config: { presence: { key: expect.stringContaining("s1:") } } }),
    );
    fake.status("SUBSCRIBED");
    await Promise.resolve();
    expect(fake.track).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s1", name: "민지", gameKind: "kordle" }));

    fake.setState({ one: [{ studentId: "s1", name: "민지", gameKind: "kordle", joinedAt: "2026-09-15T00:00:01.000Z" }] });
    fake.sync();
    expect(changes.at(-1)).toEqual([{ studentId: "s1", name: "민지", gameKind: "kordle", joinedAt: "2026-09-15T00:00:01.000Z" }]);

    unsubscribe();
    expect(fake.untrack).toHaveBeenCalledTimes(1);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });
});
