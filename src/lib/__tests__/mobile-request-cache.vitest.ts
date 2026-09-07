import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedRequest,
  clearRequestCache,
} from "../../../apps/mobile/lib/request-cache";

describe("mobile request cache", () => {
  beforeEach(() => {
    clearRequestCache();
  });

  it("runs one trailing authoritative read when force refresh arrives in-flight", async () => {
    let resolveFirst!: (value: number) => void;
    let resolveSecond!: (value: number) => void;
    const loader = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const initial = cachedRequest({ key: "student:/slimes", ttlMs: 300_000, loader });
    const forced = cachedRequest({
      key: "student:/slimes",
      ttlMs: 300_000,
      force: true,
      loader,
    });
    expect(initial).toBe(forced);

    resolveFirst(1);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(2);
    resolveSecond(2);

    await expect(forced).resolves.toBe(2);
    await expect(
      cachedRequest({ key: "student:/slimes", ttlMs: 300_000, loader }),
    ).resolves.toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
