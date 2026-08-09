import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateOutbox: vi.fn(),
  findLike: vi.fn(),
  findLikes: vi.fn(),
  findComment: vi.fn(),
  findStudent: vi.fn(),
  findTransaction: vi.fn(),
  dispatchStudent: vi.fn(),
  ensureAccount: vi.fn(),
  loadPolicy: vi.fn(),
  lockAccount: vi.fn(),
  loadPrepared: vi.fn(),
  award: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (work: (tx: Record<string, unknown>) => unknown) =>
      work({ $queryRaw: mocks.queryRaw, transaction: { findFirst: vi.fn() } }),
    notificationOutbox: { updateMany: mocks.updateOutbox },
    cardLike: { findUnique: mocks.findLike, findMany: mocks.findLikes },
    cardComment: { findUnique: mocks.findComment },
    student: { findUnique: mocks.findStudent },
    transaction: { findUnique: mocks.findTransaction },
    parentChildLink: { findUnique: vi.fn() },
    assignmentSlot: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/bank", () => ({ ensureAccountOnlyFor: mocks.ensureAccount }));
vi.mock("@/lib/reward-service", () => ({
  loadRewardPolicyCached: mocks.loadPolicy,
  lockRewardAccount: mocks.lockAccount,
  loadPreparedCommentRewardContext: mocks.loadPrepared,
  awardCappedPolicyReward: mocks.award,
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
    mocks.findStudent.mockResolvedValue(null);
    mocks.findTransaction.mockResolvedValue(null);
    mocks.dispatchStudent.mockResolvedValue({ attempted: 1, skipped: 0 });
    mocks.ensureAccount.mockResolvedValue({ accountId: "account-1", cardId: "card-1" });
    mocks.loadPolicy.mockResolvedValue({
      commentMinMeaningfulLength: 4,
      commentRewardAmount: 5,
      commentDailyRewardCap: 10,
      commentWeeklyRewardCap: 30,
      rewardBuffCapBps: Number.MAX_SAFE_INTEGER,
    });
    mocks.lockAccount.mockResolvedValue(undefined);
    mocks.loadPrepared.mockResolvedValue({
      duplicate: false,
      counts: { daily: 0, weekly: 0 },
      rewardContext: { buffBps: 0, hasActiveCreature: false },
    });
    mocks.award.mockResolvedValue({ amount: 5, idempotent: false });
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

  it("coalesces overlapping consumers onto one active claim and processing batch", async () => {
    let releaseClaim!: (events: Array<Record<string, unknown>>) => void;
    mocks.queryRaw.mockImplementationOnce(() => new Promise((resolve) => {
      releaseClaim = resolve;
    }));

    const first = consumeNotificationOutbox({ concurrency: 1 });
    const second = consumeNotificationOutbox({ concurrency: 10 });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);

    releaseClaim([{
      id: "outbox-one",
      eventType: "card_like",
      sourceId: "vanished-like",
      attempts: 1,
      lockToken: "lease-one",
    }]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { claimed: 1, processed: 1, retried: 0, dead: 0 },
      { claimed: 1, processed: 1, retried: 0, dead: 0 },
    ]);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.updateOutbox).toHaveBeenCalledTimes(1);

    mocks.queryRaw.mockResolvedValueOnce([]);
    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toEqual({
      claimed: 0,
      processed: 0,
      retried: 0,
      dead: 0,
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
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

  it("rewards one eligible student comment using its event timestamp", async () => {
    const occurredAt = new Date("2026-08-06T12:10:00.000Z");
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "outbox-comment-reward",
      eventType: "comment_reward",
      sourceId: "comment-1",
      payload: {
        version: 1,
        claimId: "claim-comment-1",
        commentId: "comment-1",
        authorKind: "student",
        authorStudentId: "student-1",
        normalizedContent: "정말 좋은 글이에요",
        occurredAt: occurredAt.toISOString(),
      },
      attempts: 1,
      lockToken: "lease-comment",
    }]);
    mocks.findStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.ensureAccount).toHaveBeenCalledWith({
      id: "student-1",
      classroomId: "classroom-1",
    });
    expect(mocks.loadPrepared).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      duplicateAlreadyClaimed: true,
      now: occurredAt,
    }));
    expect(mocks.lockAccount).toHaveBeenCalledWith(expect.anything(), "account-1");
    expect(mocks.lockAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadPrepared.mock.invocationCallOrder[0],
    );
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({
      sourceRef: "comment-1",
      occurredAt,
    }));
  });

  it("accepts a normalized compatibility expansion beyond the route input limit", async () => {
    const normalizedContent = "f".repeat(1_500);
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "expanded-reward-job",
      eventType: "comment_reward",
      sourceId: "expanded-comment",
      payload: {
        version: 1,
        claimId: "claim-expanded-comment",
        commentId: "expanded-comment",
        authorKind: "student",
        authorStudentId: "student-1",
        normalizedContent,
        occurredAt: "2026-08-06T12:10:00.000Z",
      },
      attempts: 1,
      lockToken: "expanded-lease",
    }]);
    mocks.findStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });

    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toMatchObject({
      processed: 1,
      retried: 0,
    });
    expect(mocks.award).toHaveBeenCalledOnce();
  });

  it("keeps insert-time reward eligibility after the source comment is hard-deleted", async () => {
    const occurredAt = new Date("2026-08-06T12:10:00.000Z");
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "deleted-comment-job",
      eventType: "comment_reward",
      sourceId: "deleted-comment",
      payload: {
        version: 1,
        claimId: "claim-deleted-comment",
        commentId: "deleted-comment",
        authorKind: "student",
        authorStudentId: "student-1",
        normalizedContent: "정말 좋은 글이에요",
        occurredAt: occurredAt.toISOString(),
      },
      attempts: 1,
      lockToken: "deleted-comment-lease",
    }]);
    mocks.findComment.mockResolvedValue(null);
    mocks.findStudent.mockResolvedValue({
      id: "student-1",
      classroomId: "classroom-1",
      account: { id: "account-existing", classroomId: "classroom-1" },
    });

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.ensureAccount).not.toHaveBeenCalled();
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "account-existing",
      sourceRef: "deleted-comment",
      occurredAt,
    }));
    expect(mocks.dispatchStudent).not.toHaveBeenCalled();
  });

  it("does not reward teacher comments", async () => {
    mocks.queryRaw.mockResolvedValueOnce([
      {
        id: "teacher-job",
        eventType: "comment_reward",
        sourceId: "teacher-comment",
        payload: {
          version: 1,
          claimId: "claim-teacher-comment",
          commentId: "teacher-comment",
          authorKind: "teacher",
          authorStudentId: null,
          normalizedContent: "안내 댓글입니다",
          occurredAt: "2026-08-06T12:10:00.000Z",
        },
        attempts: 1,
        lockToken: "a",
      },
    ]);

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.ensureAccount).not.toHaveBeenCalled();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("does not reward missing comments", async () => {
    mocks.queryRaw.mockResolvedValueOnce([
      { id: "missing-job", eventType: "card_comment", sourceId: "missing-comment", attempts: 1, lockToken: "b" },
    ]);
    mocks.findComment.mockResolvedValueOnce(null);

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.ensureAccount).not.toHaveBeenCalled();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("retries a reward event without paying the committed source twice", async () => {
    const occurredAt = new Date("2026-08-06T12:10:00.000Z");
    const event = {
      id: "retry-job",
      eventType: "comment_reward",
      sourceId: "comment-1",
      payload: {
        version: 1,
        claimId: "claim-comment-1",
        commentId: "comment-1",
        authorKind: "student",
        authorStudentId: "student-1",
        normalizedContent: "정말 좋은 글이에요",
        occurredAt: occurredAt.toISOString(),
      },
      attempts: 1,
      lockToken: "first-lease",
    };
    mocks.findStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.queryRaw.mockResolvedValueOnce([event]);
    mocks.award.mockResolvedValueOnce({ amount: 5, idempotent: false });
    mocks.updateOutbox
      .mockRejectedValueOnce(new Error("completion write failed"))
      .mockResolvedValueOnce({ count: 1 });

    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toMatchObject({ retried: 1 });

    mocks.queryRaw.mockResolvedValueOnce([{ ...event, attempts: 2, lockToken: "second-lease" }]);
    mocks.award.mockResolvedValueOnce({ amount: 5, idempotent: true });
    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toMatchObject({ processed: 1 });

    expect(mocks.award).toHaveBeenCalledTimes(2);
    expect(await mocks.award.mock.results[1]?.value).toMatchObject({ idempotent: true });
  });

  it("skips a later normalized duplicate even when its job runs first", async () => {
    const occurredAt = new Date("2026-08-06T12:11:00.000Z");
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "later-job",
      eventType: "comment_reward",
      sourceId: "later-comment",
      payload: {
        version: 1,
        claimId: "claim-later-comment",
        commentId: "later-comment",
        authorKind: "student",
        authorStudentId: "student-1",
        normalizedContent: "정말 좋은 글이에요",
        occurredAt: occurredAt.toISOString(),
      },
      attempts: 1,
      lockToken: "lease",
    }]);
    mocks.findStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.loadPrepared.mockResolvedValueOnce({
      duplicate: true,
      counts: { daily: 0, weekly: 0 },
      rewardContext: { buffBps: 0, hasActiveCreature: false },
    });

    await consumeNotificationOutbox({ concurrency: 1 });

    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("rejects a reward payload whose comment identity does not match its source", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{
      id: "invalid-reward-job",
      eventType: "comment_reward",
      sourceId: "comment-1",
      payload: {
        version: 1,
        claimId: "claim-invalid-comment",
        commentId: "comment-other",
        authorKind: "student",
        authorStudentId: "student-1",
        normalizedContent: "정말 좋은 글이에요",
        occurredAt: "2026-08-06T12:10:00.000Z",
      },
      attempts: 1,
      lockToken: "invalid-lease",
    }]);

    await expect(consumeNotificationOutbox({ concurrency: 1 })).resolves.toMatchObject({
      retried: 1,
      processed: 0,
    });
    expect(mocks.award).not.toHaveBeenCalled();
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
