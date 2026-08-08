import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBoardViewerLikeCacheForTests,
  loadBoardViewerLikedCardsCached,
  updateBoardViewerLikeCache,
} from "./board-viewer-like-cache";

const viewer = { kind: "student", id: "student-1" } as const;

describe("board viewer like cache", () => {
  beforeEach(() => {
    clearBoardViewerLikeCacheForTests();
  });

  it("deduplicates simultaneous loads and caches an empty result", async () => {
    const loader = vi.fn(async () => [] as string[]);
    const [first, second] = await Promise.all([
      loadBoardViewerLikedCardsCached("board-1", viewer, loader),
      loadBoardViewerLikedCardsCached("board-1", viewer, loader),
    ]);
    const third = await loadBoardViewerLikedCardsCached("board-1", viewer, loader);

    expect([...first]).toEqual([]);
    expect([...second]).toEqual([]);
    expect([...third]).toEqual([]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("applies like and unlike mutations without a reload", async () => {
    const loader = vi.fn(async () => ["card-1"]);
    await loadBoardViewerLikedCardsCached("board-1", viewer, loader);

    updateBoardViewerLikeCache("board-1", viewer, "card-2", true);
    updateBoardViewerLikeCache("board-1", viewer, "card-1", false);

    const result = await loadBoardViewerLikedCardsCached(
      "board-1",
      viewer,
      loader,
    );
    expect([...result]).toEqual(["card-2"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
