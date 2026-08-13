import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPage } from "./feed";
import {
  appendStudentFeedCache,
  clearStudentFeedCache,
  readStudentFeedCache,
  revalidateStudentFeedCache,
  studentFeedCacheHasInFlight,
  writeStudentFeedCache,
} from "./student-feed-cache";

function page(...publicationIds: string[]): FeedPage {
  return {
    items: publicationIds.map((publicationId) => ({
      publicationId,
      postId: `post-${publicationId}`,
      scope: "GLOBAL",
      classroomId: null,
      authorKind: "PLATFORM",
      authorDisplayName: "Aura",
      title: publicationId,
      body: null,
      publishedAt: "2026-08-13T00:00:00.000Z",
      media: [],
    })),
    nextCursor: null,
  };
}

describe("student feed cache", () => {
  beforeEach(() => {
    clearStudentFeedCache();
  });

  it("returns fresh data synchronously and skips first-page revalidation", async () => {
    const cached = page("cached");
    writeStudentFeedCache(cached, { now: 1_000 });
    const loader = vi.fn(async () => page("network"));

    const snapshot = readStudentFeedCache({ now: 30_999 });
    const result = await revalidateStudentFeedCache(loader, { now: 30_999 });

    expect(snapshot?.data).toEqual(cached);
    expect(snapshot?.isFresh).toBe(true);
    expect(result).toBe(snapshot?.data);
    expect(loader).not.toHaveBeenCalled();
  });

  it("serves usable stale data while revalidating the first page", async () => {
    writeStudentFeedCache(page("old"), { now: 1_000 });
    let resolve!: (value: FeedPage) => void;
    const request = revalidateStudentFeedCache(
      () => new Promise<FeedPage>((next) => (resolve = next)),
      { now: 31_000 },
    );

    expect(readStudentFeedCache({ now: 31_000 })?.data.items[0]?.publicationId).toBe(
      "old",
    );
    expect(readStudentFeedCache({ now: 31_000 })?.isStale).toBe(true);

    resolve(page("new"));
    await expect(request).resolves.toMatchObject({
      items: [expect.objectContaining({ publicationId: "new" })],
    });
    expect(readStudentFeedCache({ now: 31_001 })?.data.items[0]?.publicationId).toBe(
      "new",
    );
    expect(readStudentFeedCache({ now: 31_001 })?.isFresh).toBe(true);
  });

  it("deduplicates concurrent first-page revalidation", async () => {
    writeStudentFeedCache(page("old"), { now: 1_000 });
    let resolve!: (value: FeedPage) => void;
    const loader = vi.fn(
      () => new Promise<FeedPage>((next) => (resolve = next)),
    );

    const first = revalidateStudentFeedCache(loader, { now: 31_000 });
    const second = revalidateStudentFeedCache(loader, { now: 31_000 });

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(studentFeedCacheHasInFlight()).toBe(true);
    resolve(page("fresh"));
    await Promise.all([first, second]);
    expect(studentFeedCacheHasInFlight()).toBe(false);
  });

  it("does not repopulate after clear when a request resolves late", async () => {
    let resolve!: (value: FeedPage) => void;
    const request = revalidateStudentFeedCache(
      () => new Promise<FeedPage>((next) => (resolve = next)),
    );

    clearStudentFeedCache();
    resolve(page("late"));
    await request;

    expect(readStudentFeedCache()).toBeNull();
  });

  it("keeps a newer write when an older revalidation resolves", async () => {
    let resolve!: (value: FeedPage) => void;
    const request = revalidateStudentFeedCache(
      () => new Promise<FeedPage>((next) => (resolve = next)),
      { force: true },
    );

    writeStudentFeedCache(page("newer"));
    resolve(page("older"));
    await request;

    expect(readStudentFeedCache()?.data.items[0]?.publicationId).toBe("newer");
  });

  it("merges appended pages without duplicate publication IDs", () => {
    writeStudentFeedCache({ ...page("one", "two"), nextCursor: "cursor-1" });

    const snapshot = appendStudentFeedCache({
      ...page("two", "three"),
      nextCursor: null,
    });

    expect(snapshot.data.items.map((item) => item.publicationId)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(snapshot.data.nextCursor).toBeNull();
  });

  it("retains stale data when revalidation fails so retry can run", async () => {
    writeStudentFeedCache(page("old"), { now: 1_000 });
    const loader = vi
      .fn<() => Promise<FeedPage>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page("retried"));

    await expect(
      revalidateStudentFeedCache(loader, { now: 31_000 }),
    ).rejects.toThrow("offline");
    expect(readStudentFeedCache({ now: 31_001 })?.data.items[0]?.publicationId).toBe(
      "old",
    );
    await expect(
      revalidateStudentFeedCache(loader, { now: 31_001 }),
    ).resolves.toEqual(page("retried"));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
