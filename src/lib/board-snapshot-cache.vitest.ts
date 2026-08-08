import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBoardSnapshotCacheForTests,
  invalidateBoardSnapshotCache,
  loadBoardSnapshotCached,
} from "./board-snapshot-cache";

describe("board snapshot cache", () => {
  beforeEach(() => {
    clearBoardSnapshotCacheForTests();
    vi.useRealTimers();
  });

  it("deduplicates concurrent reads and reuses the short-lived value", async () => {
    let resolve!: (value: { cards: string[] }) => void;
    const pending = new Promise<{ cards: string[] }>((done) => {
      resolve = done;
    });
    const loader = vi.fn(() => pending);

    const first = loadBoardSnapshotCached("board-1", "rev-1", loader);
    const second = loadBoardSnapshotCached("board-1", "rev-1", loader);
    resolve({ cards: ["card-1"] });

    await expect(first).resolves.toEqual({ cards: ["card-1"] });
    await expect(second).resolves.toEqual({ cards: ["card-1"] });
    await expect(
      loadBoardSnapshotCached("board-1", "rev-1", loader),
    ).resolves.toEqual({ cards: ["card-1"] });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads on a new revision or explicit mutation invalidation", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ version: 1 })
      .mockResolvedValueOnce({ version: 2 })
      .mockResolvedValueOnce({ version: 3 });

    await expect(
      loadBoardSnapshotCached("board-1", "rev-1", loader),
    ).resolves.toEqual({ version: 1 });
    await expect(
      loadBoardSnapshotCached("board-1", "rev-2", loader),
    ).resolves.toEqual({ version: 2 });
    invalidateBoardSnapshotCache("board-1");
    await expect(
      loadBoardSnapshotCached("board-1", "rev-2", loader),
    ).resolves.toEqual({ version: 3 });
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("does not resurrect an invalidated in-flight result", async () => {
    let resolve!: (value: number) => void;
    const firstLoader = vi.fn(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        }),
    );
    const first = loadBoardSnapshotCached("board-1", "rev-1", firstLoader);
    invalidateBoardSnapshotCache("board-1");
    resolve(1);
    await expect(first).resolves.toBe(1);

    const secondLoader = vi.fn(async () => 2);
    await expect(
      loadBoardSnapshotCached("board-1", "rev-1", secondLoader),
    ).resolves.toBe(2);
    expect(secondLoader).toHaveBeenCalledTimes(1);
  });
});
