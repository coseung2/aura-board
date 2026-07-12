import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  BOARD_CACHE_MAX_ENTRIES,
  BOARD_LIST_CACHE_KEY,
  boardCacheSize,
  boardDetailCacheKey,
  clearBoardCache,
  invalidateBoardCache,
  readBoardCache,
  revalidateBoardCache,
  writeBoardCache,
} from "../../../apps/mobile/lib/board-cache";

describe("mobile board cache", () => {
  beforeEach(() => {
    clearBoardCache();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a fresh list hit without calling the loader", async () => {
    writeBoardCache(BOARD_LIST_CACHE_KEY, ["board-a"], {
      kind: "boards",
      now: 0,
    });
    const loader = vi.fn(async () => ["network"]);

    const result = await revalidateBoardCache(
      BOARD_LIST_CACHE_KEY,
      loader,
      { kind: "boards" },
    );

    expect(result).toEqual(["board-a"]);
    expect(loader).not.toHaveBeenCalled();
    expect(readBoardCache(BOARD_LIST_CACHE_KEY)?.isFresh).toBe(true);
  });

  it("revalidates a stale value while preserving it until the response arrives", async () => {
    writeBoardCache(BOARD_LIST_CACHE_KEY, ["old"], {
      kind: "boards",
      now: 0,
    });
    vi.setSystemTime(30_001);
    expect(readBoardCache(BOARD_LIST_CACHE_KEY)?.isStale).toBe(true);
    const loader = vi.fn(async () => ["new"]);

    await revalidateBoardCache(BOARD_LIST_CACHE_KEY, loader, {
      kind: "boards",
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(readBoardCache(BOARD_LIST_CACHE_KEY)?.data).toEqual(["new"]);
  });

  it("deduplicates concurrent requests per cache key", async () => {
    let resolve!: (value: string[]) => void;
    const loader = vi.fn(
      () => new Promise<string[]>((nextResolve) => (resolve = nextResolve)),
    );

    const first = revalidateBoardCache("custom-key", loader, {
      kind: "detail",
    });
    const second = revalidateBoardCache("custom-key", loader, {
      kind: "detail",
    });

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
    resolve(["done"]);
    await expect(first).resolves.toEqual(["done"]);
  });

  it("supports invalidation and force refresh for otherwise-fresh data", async () => {
    const key = boardDetailCacheKey("room-1");
    writeBoardCache(key, { version: 1 }, { kind: "detail", now: 0 });
    invalidateBoardCache(key);
    expect(readBoardCache(key)?.isStale).toBe(true);

    const loader = vi.fn(async () => ({ version: 2 }));
    await revalidateBoardCache(key, loader, { kind: "detail", force: true });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(readBoardCache(key)?.data).toEqual({ version: 2 });
  });

  it("does not serve values beyond the stale-max window", () => {
    writeBoardCache(BOARD_LIST_CACHE_KEY, ["old"], {
      kind: "boards",
      now: 0,
    });
    writeBoardCache(boardDetailCacheKey("room-2"), { old: true }, {
      kind: "detail",
      now: 0,
    });

    vi.setSystemTime(5 * 60_000 + 1);
    expect(readBoardCache(BOARD_LIST_CACHE_KEY)).toBeNull();
    vi.setSystemTime(2 * 60_000 + 1);
    expect(readBoardCache(boardDetailCacheKey("room-2"))).toBeNull();
  });

  it("prunes entries to the bounded cache size", () => {
    for (let index = 0; index < BOARD_CACHE_MAX_ENTRIES + 5; index += 1) {
      writeBoardCache(`detail-${index}`, { index }, {
        kind: "detail",
        now: index,
      });
    }
    expect(boardCacheSize()).toBeLessThanOrEqual(BOARD_CACHE_MAX_ENTRIES);
    expect(readBoardCache("detail-0")).toBeNull();
  });

  it("clears entries and prevents an old in-flight response from repopulating them", async () => {
    let resolve!: (value: string[]) => void;
    const request = revalidateBoardCache(
      BOARD_LIST_CACHE_KEY,
      () => new Promise<string[]>((nextResolve) => (resolve = nextResolve)),
      { kind: "boards" },
    );
    clearBoardCache();
    resolve(["previous-session"]);
    await request;
    expect(readBoardCache(BOARD_LIST_CACHE_KEY)).toBeNull();
  });
});

