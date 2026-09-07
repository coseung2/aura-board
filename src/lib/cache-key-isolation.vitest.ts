import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoardSnapshotCached, invalidateBoardSnapshotCache } from "./board-snapshot-cache";
import { loadBoardAccessBaseCached, invalidateBoardAccessCache, type BoardAccessBase } from "./board-access-cache";
import { loadCardAccessBaseCached, invalidateCardAccessCache, type CachedCardAccessBase } from "./card-access-cache";
import { loadBoardViewerLikedCardsCached, invalidateBoardViewerLikeCache, updateBoardViewerLikeCache } from "./board-viewer-like-cache";

const viewer = { kind: "student", id: "student-1" } as const;
const board: BoardAccessBase = { id: "board-a", classroomId: "class-a", anonymousAuthor: false, layout: "columns", teacherId: "teacher-a" };
const card: CachedCardAccessBase = { id: "card-a", studentAuthorId: null, studentAuthorIds: [], board: { id: "board-a", classroomId: "class-a", anonymousAuthor: false } };

const cases = [
  { name: "board access", load: (loader: () => Promise<BoardAccessBase>) => loadBoardAccessBaseCached("board-a", loader), invalidate: () => invalidateBoardAccessCache("board-b"), value: board },
  { name: "card access", load: (loader: () => Promise<CachedCardAccessBase>) => loadCardAccessBaseCached("card-a", loader), invalidate: () => invalidateCardAccessCache("card-b"), value: card },
  { name: "board snapshot", load: (loader: () => Promise<BoardAccessBase>) => loadBoardSnapshotCached("board-a", "revision-1", loader), invalidate: () => invalidateBoardSnapshotCache("board-b"), value: board },
];

describe("cache key isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateBoardSnapshotCache();
    invalidateBoardAccessCache();
    invalidateCardAccessCache();
    invalidateBoardViewerLikeCache();
  });
  afterEach(() => vi.useRealTimers());

  it.each(cases)("$name: another key cannot discard or strand an in-flight entry", async ({ load, invalidate, value }) => {
    let resolve!: (value: never) => void;
    const loader = vi.fn<() => Promise<never>>().mockResolvedValue(value as never).mockImplementationOnce(() => new Promise<never>((done) => { resolve = done; }));
    const first = load(loader);
    invalidate();
    resolve(value as never);
    await first;
    await load(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(65_000);
    const next = load(loader);
    expect(loader).toHaveBeenCalledTimes(2);
    resolve(value as never);
    await next;
  });

  it("viewer likes still expire after another board is invalidated during a read", async () => {
    let resolve!: (value: string[]) => void;
    const loader = vi.fn(() => new Promise<string[]>((done) => { resolve = done; }));
    const first = loadBoardViewerLikedCardsCached("board-a", viewer, loader);
    invalidateBoardViewerLikeCache("board-b");
    resolve(["card-a"]);
    await first;
    await vi.advanceTimersByTimeAsync(65_000);
    const next = loadBoardViewerLikedCardsCached("board-a", viewer, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    resolve(["card-a", "card-b"]);
    expect([...(await next)]).toEqual(["card-a", "card-b"]);
  });

  it("a like mutation on a cold cache cannot invent a complete liked-card set", async () => {
    updateBoardViewerLikeCache("board-a", viewer, "card-b", true);
    const loader = vi.fn(async () => ["card-a", "card-b"]);
    const result = await loadBoardViewerLikedCardsCached("board-a", viewer, loader);
    expect([...result]).toEqual(["card-a", "card-b"]);
    expect(loader).toHaveBeenCalledOnce();
  });
});
