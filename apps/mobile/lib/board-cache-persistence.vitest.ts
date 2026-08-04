import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  read: vi.fn<(key: string) => Promise<unknown>>(),
  remove: vi.fn<(key: string) => Promise<void>>(() => Promise.resolve()),
  write: vi.fn<(key: string, value: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  ),
}));

vi.mock("./persistent-json-cache", () => ({
  readPersistentJson: persistence.read,
  removePersistentJson: persistence.remove,
  writePersistentJson: persistence.write,
}));

import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  clearBoardCache,
  hydrateBoardCache,
  readBoardCache,
  writeBoardCache,
} from "./board-cache";

describe("persistent board cache", () => {
  beforeEach(() => {
    clearBoardCache();
    persistence.read.mockReset();
    persistence.remove.mockClear();
    persistence.write.mockClear();
  });

  it("restores a persisted home snapshot as usable stale data", async () => {
    persistence.read.mockResolvedValue({
      version: 1,
      savedAt: Date.now() - 60_000,
      entries: [
        {
          key: STUDENT_HOME_CACHE_KEY,
          data: { student: { id: "student-1" }, boards: [] },
          kind: "boards",
          fetchedAt: Date.now() - 60_000,
        },
      ],
    });

    await hydrateBoardCache();

    const snapshot = readBoardCache<{ student: { id: string } }>(
      STUDENT_HOME_CACHE_KEY,
      { kind: "boards" },
    );
    expect(snapshot?.data.student.id).toBe("student-1");
    expect(snapshot?.isStale).toBe(true);
  });

  it("ignores snapshots older than one day", async () => {
    persistence.read.mockResolvedValue({
      version: 1,
      savedAt: Date.now() - 24 * 60 * 60_000 - 1,
      entries: [
        {
          key: STUDENT_HOME_CACHE_KEY,
          data: { student: { id: "student-1" }, boards: [] },
          kind: "boards",
          fetchedAt: Date.now(),
        },
      ],
    });

    await hydrateBoardCache();

    expect(readBoardCache(STUDENT_HOME_CACHE_KEY, { kind: "boards" })).toBeNull();
  });

  it("persists shared snapshots and recently opened board details", async () => {
    writeBoardCache(STUDENT_HOME_CACHE_KEY, { student: { id: "student-1" } }, {
      kind: "boards",
    });
    writeBoardCache(BOARD_LIST_CACHE_KEY, [], { kind: "boards" });
    writeBoardCache("student:board:private", { cards: [] }, { kind: "detail" });

    expect(persistence.write).toHaveBeenCalledTimes(3);
    const latest = persistence.write.mock.calls.at(-1)?.[1] as {
      entries: Array<{ key: string }>;
    };
    expect(latest.entries.map((entry) => entry.key).sort()).toEqual(
      [
        BOARD_LIST_CACHE_KEY,
        STUDENT_HOME_CACHE_KEY,
        "student:board:private",
      ].sort(),
    );
  });

  it("removes persisted data at an authentication boundary", () => {
    clearBoardCache();
    expect(persistence.remove).toHaveBeenCalled();
  });
});
