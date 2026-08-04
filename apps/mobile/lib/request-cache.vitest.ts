import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedRequest, clearRequestCache } from "./request-cache";

describe("request cache", () => {
  beforeEach(() => {
    clearRequestCache();
    vi.useRealTimers();
  });

  it("reuses a fresh response", async () => {
    const loader = vi.fn(async () => ({ value: 1 }));
    const first = await cachedRequest({ key: "student:/me", ttlMs: 1_000, loader });
    const second = await cachedRequest({ key: "student:/me", ttlMs: 1_000, loader });

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent requests", async () => {
    let resolve!: (value: number) => void;
    const loader = vi.fn(
      () => new Promise<number>((next) => {
        resolve = next;
      }),
    );
    const first = cachedRequest({ key: "student:/reading", ttlMs: 1_000, loader });
    const second = cachedRequest({ key: "student:/reading", ttlMs: 1_000, loader });
    resolve(7);

    await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("forces a refresh and replaces the cached response", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    await cachedRequest({ key: "student:/slimes", ttlMs: 1_000, loader });
    const refreshed = await cachedRequest({
      key: "student:/slimes",
      ttlMs: 1_000,
      force: true,
      loader,
    });

    expect(refreshed).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate the cache after an auth-boundary clear", async () => {
    let resolve!: (value: number) => void;
    const firstLoader = vi.fn(
      () => new Promise<number>((next) => {
        resolve = next;
      }),
    );
    const first = cachedRequest({ key: "student:/me", ttlMs: 1_000, loader: firstLoader });
    clearRequestCache();
    resolve(1);
    await first;

    const secondLoader = vi.fn(async () => 2);
    await expect(
      cachedRequest({ key: "student:/me", ttlMs: 1_000, loader: secondLoader }),
    ).resolves.toBe(2);
    expect(secondLoader).toHaveBeenCalledTimes(1);
  });
});
