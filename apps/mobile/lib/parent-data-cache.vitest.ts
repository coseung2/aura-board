import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PARENT_OVERVIEW_CACHE_KEY,
  clearParentDataCache,
  parentDataCacheHasInFlight,
  parentDataCacheSize,
  parentPostCollectionCacheKey,
  readParentDataCache,
  removeParentDataCacheByPrefix,
  revalidateParentDataCache,
  updateParentDataCache,
  writeParentDataCache,
} from "./parent-data-cache";

describe("parent data cache", () => {
  beforeEach(() => {
    clearParentDataCache();
  });

  it("returns fresh data synchronously and skips the loader within the TTL", async () => {
    writeParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      { children: ["cached"] },
      { kind: "overview", now: 1_000 },
    );
    const loader = vi.fn(async () => ({ children: ["network"] }));

    const result = await revalidateParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      loader,
      { kind: "overview", now: 5_000 },
    );

    expect(result).toEqual({ children: ["cached"] });
    expect(loader).not.toHaveBeenCalled();
    expect(
      readParentDataCache(PARENT_OVERVIEW_CACHE_KEY, {
        kind: "overview",
        now: 5_000,
      })?.isFresh,
    ).toBe(true);
  });

  it("deduplicates stale revalidation requests", async () => {
    writeParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      { children: ["stale"] },
      { kind: "overview", now: 1_000 },
    );
    let resolve!: (value: { children: string[] }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ children: string[] }>((next) => {
          resolve = next;
        }),
    );

    const first = revalidateParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      loader,
      { kind: "overview", now: 40_000 },
    );
    const second = revalidateParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      loader,
      { kind: "overview", now: 40_000 },
    );

    expect(loader).toHaveBeenCalledTimes(1);
    expect(parentDataCacheHasInFlight(PARENT_OVERVIEW_CACHE_KEY)).toBe(true);
    resolve({ children: ["fresh"] });
    await expect(first).resolves.toEqual({ children: ["fresh"] });
    await expect(second).resolves.toEqual({ children: ["fresh"] });
    expect(
      readParentDataCache<{ children: string[] }>(PARENT_OVERVIEW_CACHE_KEY, {
        kind: "overview",
        now: 40_001,
      })?.data,
    ).toEqual({ children: ["fresh"] });
  });

  it("keeps an optimistic write when an older request completes", async () => {
    let resolve!: (value: { children: string[] }) => void;
    const request = revalidateParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      () =>
        new Promise<{ children: string[] }>((next) => {
          resolve = next;
        }),
      { kind: "overview", force: true },
    );

    writeParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      { children: ["optimistic"] },
      { kind: "overview" },
    );
    resolve({ children: ["old-server-value"] });
    await request;

    expect(
      readParentDataCache<{ children: string[] }>(PARENT_OVERVIEW_CACHE_KEY, {
        kind: "overview",
      })?.data,
    ).toEqual({ children: ["optimistic"] });
  });

  it("updates cached values and removes a family of post collections", () => {
    writeParentDataCache(
      PARENT_OVERVIEW_CACHE_KEY,
      { pending: ["a", "b"] },
      { kind: "overview" },
    );
    updateParentDataCache<{ pending: string[] }>(
      PARENT_OVERVIEW_CACHE_KEY,
      (current) => ({ pending: current.pending.filter((id) => id !== "a") }),
      { kind: "overview" },
    );

    const feedKey = parentPostCollectionCacheKey("/api/parent/feed");
    const childKey = parentPostCollectionCacheKey(
      "/api/parent/children/child-1/posts?kind=media",
    );
    writeParentDataCache(feedKey, { items: [1] }, { kind: "feed" });
    writeParentDataCache(childKey, { items: [2] }, { kind: "feed" });
    removeParentDataCacheByPrefix("parent:posts:");

    expect(
      readParentDataCache<{ pending: string[] }>(PARENT_OVERVIEW_CACHE_KEY, {
        kind: "overview",
      })?.data,
    ).toEqual({ pending: ["b"] });
    expect(readParentDataCache(feedKey)).toBeNull();
    expect(readParentDataCache(childKey)).toBeNull();
    expect(parentDataCacheSize()).toBe(1);
  });
});
