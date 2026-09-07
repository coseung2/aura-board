import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../apps/mobile/lib/persistent-json-cache", () => ({ readPersistentJson: async () => null, writePersistentJson: async () => undefined, removePersistentJson: async () => undefined }));
import { clearBoardCache, revalidateBoardCache, readBoardCache, invalidateBoardCache, removeBoardCache } from "../../../apps/mobile/lib/board-cache";
import { clearParentDataCache, revalidateParentDataCache, readParentDataCache, invalidateParentDataCache, removeParentDataCacheByPrefix } from "../../../apps/mobile/lib/parent-data-cache";
import "../../../apps/mobile/lib/parent-data-cache.vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("public mobile cache races", () => {
  beforeEach(() => { clearBoardCache(); clearParentDataCache(); });

  it("board invalidation retains a fresh trailing read even without force at the caller", async () => {
    const old = deferred<string[]>();
    const loader = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue([]);
    const first = revalidateBoardCache("board", loader);
    invalidateBoardCache("board");
    const next = revalidateBoardCache("board", loader);
    old.resolve(["deleted"]);
    expect(await first).toEqual([]);
    expect(await next).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("a removed board is not repopulated by an older response", async () => {
    const old = deferred<string[]>();
    const first = revalidateBoardCache("board", () => old.promise);
    removeBoardCache("board");
    old.resolve(["revoked"]);
    await first;
    expect(readBoardCache("board")).toBeNull();
  });

  it("a parent force refresh reconciles after an older in-flight request", async () => {
    const old = deferred<string[]>();
    const loader = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue(["new"]);
    const first = revalidateParentDataCache("parent:overview", loader);
    const next = revalidateParentDataCache("parent:overview", loader, { force: true });
    old.resolve(["old"]);
    expect(await first).toEqual(["new"]);
    expect(await next).toEqual(["new"]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it.each(["all", "prefix"])("parent %s invalidation includes cold pending-only keys", async (mode) => {
    const old = deferred<string[]>();
    const key = "parent:posts:child-a";
    const first = revalidateParentDataCache(key, () => old.promise);
    if (mode === "all") invalidateParentDataCache();
    else removeParentDataCacheByPrefix("parent:posts:");
    await revalidateParentDataCache(key, async () => ["new"]);
    old.resolve(["old"]);
    await first;
    expect(readParentDataCache<string[]>(key)?.data).toEqual(["new"]);
  });
});
