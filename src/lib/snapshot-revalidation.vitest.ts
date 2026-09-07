import { describe, expect, it, vi } from "vitest";
import { revalidateSnapshot } from "./snapshot-revalidation";
import { loadBoardSnapshotCached, invalidateBoardSnapshotCache } from "./board-snapshot-cache";
import { loadStudentBoardBaseCached, invalidateStudentBoardCache } from "./student-board-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("authoritative snapshot reconciliation", () => {
  it("retains a trailing read and gives every overlapping caller the latest response", async () => {
    const old = deferred<number>();
    const first = revalidateSnapshot("race", () => old.promise);
    await Promise.resolve();
    const latest = vi.fn(async () => 2);
    const second = revalidateSnapshot("race", latest);
    const third = revalidateSnapshot("race", latest);
    expect(first).toBe(second);
    expect(second).toBe(third);
    old.resolve(1);
    expect(await Promise.all([first, second, third])).toEqual([2, 2, 2]);
    expect(latest).toHaveBeenCalledOnce();
  });

  it("retries a newer invalidation after an older read fails", async () => {
    const old = deferred<number>();
    const first = revalidateSnapshot("failure", () => old.promise);
    await Promise.resolve();
    revalidateSnapshot("failure", async () => 3);
    old.reject(new Error("old request failed"));
    await expect(first).resolves.toBe(3);
    await expect(revalidateSnapshot("failure", async () => 4)).resolves.toBe(4);
  });

  it("bypasses process-local settled snapshots even when the revision has not changed yet", async () => {
    invalidateBoardSnapshotCache();
    await loadBoardSnapshotCached("board-1", "same-revision", async () => ["deleted-card"]);
    const loader = vi.fn(async () => [] as string[]);
    await expect(loadBoardSnapshotCached("board-1", "same-revision", loader, { force: true })).resolves.toEqual([]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("does not let an older graph repopulate a freshly reconciled student board", async () => {
    invalidateStudentBoardCache();
    const old = deferred<{ id: string; cards: string[] }>();
    const previous = loadStudentBoardBaseCached("class-1", "slug", () => old.promise);
    const result = { id: "board-1", cards: [] as string[] };
    await expect(loadStudentBoardBaseCached("class-1", "slug", async () => result, { force: true })).resolves.toEqual(result);
    old.resolve({ id: "board-1", cards: ["deleted-card"] });
    await previous;
    const loader = vi.fn(async () => result);
    await expect(loadStudentBoardBaseCached("class-1", "slug", loader)).resolves.toEqual(result);
    expect(loader).not.toHaveBeenCalled();
  });
});
