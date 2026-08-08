import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBoardSnapshotMetaCacheForTests,
  invalidateBoardSnapshotMetaCache,
  loadBoardSnapshotMetaCached,
} from "./board-snapshot-meta-cache";

function meta(version: number) {
  return {
    id: "board-1",
    classroomId: "classroom-1",
    layout: "freeform",
    anonymousAuthor: false,
    updatedAt: new Date(`2026-08-08T00:00:0${version}.000Z`),
    questionPrompt: null,
    questionVizMode: "word-cloud",
  };
}

describe("board snapshot metadata cache", () => {
  beforeEach(() => {
    clearBoardSnapshotMetaCacheForTests();
  });

  it("deduplicates simultaneous id/slug metadata reads", async () => {
    const loader = vi.fn(async () => meta(1));
    const [first, second] = await Promise.all([
      loadBoardSnapshotMetaCached("board-slug", loader),
      loadBoardSnapshotMetaCached("board-slug", loader),
    ]);
    const third = await loadBoardSnapshotMetaCached("board-slug", loader);

    expect(first?.id).toBe("board-1");
    expect(second?.id).toBe("board-1");
    expect(third?.updatedAt).toEqual(meta(1).updatedAt);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("invalidates a slug lookup by resolved board id", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(meta(1))
      .mockResolvedValueOnce(meta(2));
    await loadBoardSnapshotMetaCached("board-slug", loader);
    invalidateBoardSnapshotMetaCache("board-1");
    const refreshed = await loadBoardSnapshotMetaCached("board-slug", loader);

    expect(refreshed?.updatedAt).toEqual(meta(2).updatedAt);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
