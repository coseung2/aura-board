import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateOutbox: vi.fn(),
  findLike: vi.fn(),
  findLikes: vi.fn(),
  findComment: vi.fn(),
  findTransaction: vi.fn(),
  dispatchStudent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (work: (tx: { $queryRaw: typeof mocks.queryRaw }) => unknown) =>
      work({ $queryRaw: mocks.queryRaw }),
    notificationOutbox: { updateMany: mocks.updateOutbox },
    cardLike: { findUnique: mocks.findLike, findMany: mocks.findLikes },
    cardComment: { findUnique: mocks.findComment },
    transaction: { findUnique: mocks.findTransaction },
    parentChildLink: { findUnique: vi.fn() },
    assignmentSlot: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/student-push", () => ({ dispatchStudentNotificationPush: mocks.dispatchStudent }));
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
    mocks.findLikes.mockResolvedValue([]);
    mocks.findComment.mockResolvedValue(null);
    mocks.findTransaction.mockResolvedValue(null);
    mocks.dispatchStudent.mockResolvedValue({ attempted: 1, skipped: 0 });
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

  it("groups likes from one five-minute card bucket into one digest", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "outbox-like",
      eventType: "card_like",
      sourceId: "like-1",
      attempts: 1,
      lockToken: "lease-like",
    }]);
    mocks.findLike.mockResolvedValue({
      id: "like-1",
      cardId: "card-1",
      likerKind: "student",
      likerStudentId: "student-liker",
      createdAt: new Date("2026-08-06T12:01:00.000Z"),
      card: {
        id: "card-1",
        title: "나의 그림",
        studentAuthorId: "student-owner",
        authors: [],
        board: { slug: "art", title: "미술", anonymousAuthor: false },
      },
    });
    mocks.findLikes.mockResolvedValue([
      {
        likerKind: "student",
        likerStudentId: "student-liker",
        createdAt: new Date("2026-08-06T12:01:00.000Z"),
        likerUser: null,
        likerStudent: { name: "민수" },
      },
      {
        likerKind: "teacher",
        likerStudentId: null,
        createdAt: new Date("2026-08-06T12:02:00.000Z"),
        likerUser: { name: "김" },
        likerStudent: null,
      },
    ]);

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.dispatchStudent).toHaveBeenCalledOnce();
    expect(mocks.dispatchStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "student-owner",
        kind: "like",
        eventKey: expect.stringContaining("like-digest:card-1:"),
        body: "민수 외 1명이 나의 그림에 좋아요를 눌렀어요.",
      }),
      { propagateFailure: true },
    );
  });

  it("prioritizes a reply notification when the post owner also owns the parent comment", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "outbox-comment",
      eventType: "card_comment",
      sourceId: "comment-2",
      attempts: 1,
      lockToken: "lease-comment",
    }]);
    mocks.findComment.mockResolvedValue({
      id: "comment-2",
      authorKind: "student",
      authorStudentId: "student-replier",
      authorStudent: { name: "수빈" },
      authorUser: null,
      externalAuthorName: null,
      content: "나도 그렇게 생각해",
      createdAt: new Date("2026-08-06T12:10:00.000Z"),
      deletedAt: null,
      parentComment: { authorStudentId: "student-owner" },
      card: {
        title: "토론 글",
        studentAuthorId: "student-owner",
        authors: [],
        board: { slug: "discussion", title: "토론", anonymousAuthor: false },
      },
    });

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.dispatchStudent).toHaveBeenCalledOnce();
    expect(mocks.dispatchStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "student-owner",
        kind: "reply",
        title: "내 댓글에 새 답글이 달렸어요",
      }),
      { propagateFailure: true },
    );
  });

  it("sends any balance transaction as a wallet notification without middle dots", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "outbox-wallet",
      eventType: "transaction",
      sourceId: "transaction-1",
      attempts: 1,
      lockToken: "lease-wallet",
    }]);
    mocks.findTransaction.mockResolvedValue({
      id: "transaction-1",
      type: "withdraw",
      amount: 500,
      balanceAfter: 1500,
      note: "학급 상점 구매",
      sourceType: null,
      createdAt: new Date("2026-08-06T12:20:00.000Z"),
      account: {
        studentId: "student-1",
        classroom: { currency: { unitLabel: "원" } },
      },
    });

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.dispatchStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "wallet",
        title: "500원이 나갔어요",
        body: "학급 상점 구매로 처리됐어요. 현재 잔액은 1,500원이에요.",
      }),
      { propagateFailure: true },
    );
    expect(JSON.stringify(mocks.dispatchStudent.mock.calls)).not.toContain("·");
  });
});
