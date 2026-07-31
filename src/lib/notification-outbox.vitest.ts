import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateOutbox: vi.fn(),
  findLike: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (work: (tx: { $queryRaw: typeof mocks.queryRaw }) => unknown) =>
      work({ $queryRaw: mocks.queryRaw }),
    notificationOutbox: { updateMany: mocks.updateOutbox },
    cardLike: { findUnique: mocks.findLike },
    cardComment: { findUnique: vi.fn() },
    transaction: { findUnique: vi.fn() },
    parentChildLink: { findUnique: vi.fn() },
    assignmentSlot: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/student-push", () => ({ dispatchStudentNotificationPush: vi.fn() }));
vi.mock("@/lib/parent-push", () => ({ dispatchParentNotificationPush: vi.fn() }));
vi.mock("@/lib/pets/catalog", () => ({ getSlimeShopItem: vi.fn() }));

import {
  claimNotificationOutbox,
  consumeNotificationOutbox,
  notificationRetryDelayMs,
} from "./notification-outbox";

describe("notification outbox leases and retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.updateOutbox.mockResolvedValue({ count: 1 });
    mocks.findLike.mockResolvedValue(null);
  });

  it("claims a bounded batch atomically with a skip-locked lease", async () => {
    const now = new Date("2026-07-31T00:00:00.000Z");
    await claimNotificationOutbox(10_000, now);

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    const query = mocks.queryRaw.mock.calls[0][0] as { sql?: string; strings?: string[] };
    const sql = query.sql ?? query.strings?.join("?") ?? "";
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("WITH terminalized AS");
    expect(sql).toContain("'LeaseExpired'");
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("outbox.\"attempts\" + 1");
    expect(query.strings ? query.strings.length : 0).toBeGreaterThan(0);
  });

  it("completes a safely vanished source without recreating historical data", async () => {
    mocks.queryRaw.mockResolvedValue([{
      id: "outbox-1",
      eventType: "card_like",
      sourceId: "deleted-like",
      attempts: 1,
      lockToken: "lease-1",
    }]);

    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toEqual({
      claimed: 1,
      processed: 1,
      retried: 0,
      dead: 0,
    });
    expect(mocks.updateOutbox).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "outbox-1", lockToken: "lease-1", status: "processing" },
      data: expect.objectContaining({ status: "done" }),
    }));
  });

  it("backs off retryable failures and terminates the eighth attempt", async () => {
    expect(notificationRetryDelayMs(1)).toBe(30_000);
    expect(notificationRetryDelayMs(2)).toBe(60_000);
    expect(notificationRetryDelayMs(99)).toBeLessThanOrEqual(60 * 60 * 1_000);

    mocks.queryRaw.mockResolvedValueOnce([{
      id: "retry-1",
      eventType: "unknown",
      sourceId: "source-1",
      attempts: 2,
      lockToken: "lease-2",
    }]);
    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toMatchObject({
      retried: 1,
      dead: 0,
    });
    expect(mocks.updateOutbox).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending", lockedAt: null, lockToken: null }),
    }));

    mocks.queryRaw.mockResolvedValueOnce([{
      id: "dead-1",
      eventType: "unknown",
      sourceId: "source-2",
      attempts: 8,
      lockToken: "lease-3",
    }]);
    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toMatchObject({
      retried: 0,
      dead: 1,
    });
    expect(mocks.updateOutbox).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "dead" }),
    }));
  });
});
