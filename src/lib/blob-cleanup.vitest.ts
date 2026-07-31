import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  createMany: vi.fn(),
  deletePublicObjects: vi.fn(),
  parseUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (
      work: (tx: { $queryRaw: typeof mocks.queryRaw }) => unknown,
    ) => work({ $queryRaw: mocks.queryRaw }),
    $queryRaw: mocks.queryRaw,
    blobDeletionQueue: {
      updateMany: mocks.updateMany,
      createMany: mocks.createMany,
    },
  },
}));

vi.mock("@/lib/media-storage", () => ({
  deletePublicObjects: mocks.deletePublicObjects,
  parseSupabasePublicObjectUrl: mocks.parseUrl,
}));

import {
  blobRetryDelayMs,
  claimBlobDeletionQueue,
  enqueueBlobDeletion,
  processBlobDeletionQueue,
} from "./blob-cleanup";

const now = new Date("2026-07-31T00:00:00.000Z");
const managedUrl = (name: string) =>
  `https://project.supabase.co/storage/v1/object/public/aura-board-uploads/${name}`;

function sqlText(value: unknown): string {
  const query = value as { sql?: string; strings?: readonly string[] };
  return query.sql ?? query.strings?.join("?") ?? "";
}

describe("blob cleanup leases and retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.deletePublicObjects.mockResolvedValue({ deleted: 1, skipped: 0 });
    mocks.parseUrl.mockReturnValue({
      bucket: "aura-board-uploads",
      pathname: "object",
    });
  });

  it("claims a bounded batch with a skip-locked lease and URL serialization", async () => {
    await Promise.all([
      claimBlobDeletionQueue(10_000, now),
      claimBlobDeletionQueue(10_000, now),
    ]);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    for (const [query] of mocks.queryRaw.mock.calls) {
      const sql = sqlText(query);
      expect(sql).toContain("FOR UPDATE SKIP LOCKED");
      expect(sql).toContain('DISTINCT ON (candidate."url")');
      expect(sql).toContain("NOT EXISTS");
      expect(sql).toContain('"attempts" = queue."attempts" + 1');
      expect(sql).toContain("LIMIT");
    }
  });

  it("backs off referenced rows so later rows in the batch still run", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([
        {
          id: "referenced",
          url: managedUrl("referenced.png"),
          attempts: 1,
          lockToken: "lease-1",
        },
        {
          id: "later",
          url: managedUrl("later.png"),
          attempts: 1,
          lockToken: "lease-2",
        },
      ])
      .mockResolvedValueOnce([{ referenced: true }])
      .mockResolvedValueOnce([{ referenced: false }]);

    await expect(processBlobDeletionQueue(25, now)).resolves.toEqual({
      checked: 2,
      deleted: 1,
      retained: 1,
      failed: 0,
      dead: 0,
    });

    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "referenced", lockToken: "lease-1", status: "processing" },
        data: expect.objectContaining({
          attempts: 0,
          status: "pending",
          lastError: "still_referenced",
          nextAttemptAt: new Date(now.getTime() + 60 * 60 * 1_000),
        }),
      }),
    );
    expect(mocks.deletePublicObjects).toHaveBeenCalledWith([
      managedUrl("later.png"),
    ]);
  });

  it("uses one bounded EXISTS query covering every current media reference", async () => {
    const url = managedUrl("referenced.png");
    mocks.queryRaw
      .mockResolvedValueOnce([
        { id: "item", url, attempts: 1, lockToken: "lease" },
      ])
      .mockResolvedValueOnce([{ referenced: true }]);

    await processBlobDeletionQueue(1, now);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    const sql = sqlText(mocks.queryRaw.mock.calls[1][0]);
    expect(sql).toContain("SELECT EXISTS");
    for (const reference of [
      '"Card"',
      '"CardAttachment"',
      '"StudentAsset"',
      '"Submission"',
      '"Board"',
      '"VibeProject"',
      '"PlantObservationImage"',
      '"DjPlayEvent"',
    ]) {
      expect(sql).toContain(reference);
    }
    expect(sql).toContain('"thumbnailUrl"');
    expect(sql).toContain('"videoThumbnail"');
    expect(sql).toContain('"previewUrl"');
  });

  it("dead-letters a failed item at the bounded attempt limit", async () => {
    const url = managedUrl("permanent-after-retries.png");
    mocks.queryRaw
      .mockResolvedValueOnce([
        { id: "dead", url, attempts: 8, lockToken: "lease-dead" },
      ])
      .mockResolvedValueOnce([{ referenced: false }]);
    mocks.deletePublicObjects.mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    await expect(processBlobDeletionQueue(1, now)).resolves.toMatchObject({
      checked: 1,
      failed: 1,
      dead: 1,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dead", lockToken: "lease-dead", status: "processing" },
        data: expect.objectContaining({
          status: "dead",
          terminal: true,
          nextAttemptAt: now,
          lastError: "storage unavailable",
        }),
      }),
    );
  });

  it("backs off a transient deletion failure before the terminal attempt", async () => {
    const url = managedUrl("retry.png");
    mocks.queryRaw
      .mockResolvedValueOnce([
        { id: "retry", url, attempts: 2, lockToken: "lease-retry" },
      ])
      .mockResolvedValueOnce([{ referenced: false }]);
    mocks.deletePublicObjects.mockRejectedValueOnce(
      new Error("temporary outage"),
    );

    await expect(processBlobDeletionQueue(1, now)).resolves.toMatchObject({
      checked: 1,
      failed: 1,
      dead: 0,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending",
          terminal: false,
          nextAttemptAt: new Date(now.getTime() + blobRetryDelayMs(2)),
          lastError: "temporary outage",
        }),
      }),
    );
  });

  it("dead-letters unsupported URLs without calling storage or reference scans", async () => {
    const url = "https://example.com/not-project-storage.png";
    mocks.parseUrl.mockReturnValue(null);
    mocks.queryRaw.mockResolvedValueOnce([
      { id: "unsupported", url, attempts: 1, lockToken: "lease-unsupported" },
    ]);

    await expect(processBlobDeletionQueue(1, now)).resolves.toMatchObject({
      checked: 1,
      failed: 1,
      dead: 1,
    });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.deletePublicObjects).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "dead",
          terminal: true,
          lastError: "unsupported_storage_url",
        }),
      }),
    );
  });

  it("marks an unreferenced object done after successful deletion", async () => {
    const url = managedUrl("success.png");
    mocks.queryRaw
      .mockResolvedValueOnce([
        { id: "success", url, attempts: 1, lockToken: "lease-success" },
      ])
      .mockResolvedValueOnce([{ referenced: false }]);

    await expect(processBlobDeletionQueue(1, now)).resolves.toMatchObject({
      checked: 1,
      deleted: 1,
      failed: 0,
      dead: 0,
    });
    expect(mocks.deletePublicObjects).toHaveBeenCalledWith([url]);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "success",
          lockToken: "lease-success",
          status: "processing",
        },
        data: expect.objectContaining({
          status: "done",
          terminal: true,
          deletedAt: now,
          lockedAt: null,
          lockToken: null,
        }),
      }),
    );
  });

  it("keeps the seven-day delay and managed URL validation when enqueueing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const managed = managedUrl("delayed.png");
    mocks.parseUrl.mockImplementation((url: string | null | undefined) =>
      url === managed
        ? { bucket: "aura-board-uploads", pathname: "delayed.png" }
        : null,
    );

    try {
      await enqueueBlobDeletion(
        [managed, managed, "https://example.com/remote.png"],
        "test",
      );
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        {
          url: managed,
          source: "test",
          resourceType: null,
          resourceId: null,
          deleteAfter: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          nextAttemptAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          status: "pending",
          terminal: false,
        },
      ],
    });
  });

  it("uses capped exponential backoff for failed attempts", () => {
    expect(blobRetryDelayMs(1)).toBe(30_000);
    expect(blobRetryDelayMs(2)).toBe(60_000);
    expect(blobRetryDelayMs(99)).toBe(60 * 60 * 1_000);
  });
});
