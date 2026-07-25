import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  stateFindUnique: vi.fn(),
  receiptFindMany: vi.fn(),
  currencyFindUnique: vi.fn(),
  likeCount: vi.fn(),
  commentCount: vi.fn(),
  rewardCount: vi.fn(),
  likeFindMany: vi.fn(),
  commentFindMany: vi.fn(),
  rewardFindMany: vi.fn(),
  rewardFindFirst: vi.fn(),
  receiptUpsert: vi.fn(),
  stateUpsert: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: mocks.getCurrentStudent,
}));

vi.mock("@/lib/db", () => ({
  db: {
    studentNotificationState: {
      findUnique: mocks.stateFindUnique,
      upsert: mocks.stateUpsert,
    },
    studentNotificationReceipt: {
      findMany: mocks.receiptFindMany,
      upsert: mocks.receiptUpsert,
    },
    classroomCurrency: { findUnique: mocks.currencyFindUnique },
    cardLike: { count: mocks.likeCount, findMany: mocks.likeFindMany },
    cardComment: { count: mocks.commentCount, findMany: mocks.commentFindMany },
    transaction: {
      count: mocks.rewardCount,
      findMany: mocks.rewardFindMany,
      findFirst: mocks.rewardFindFirst,
    },
  },
}));

import { GET, POST } from "./route";

describe("/api/student/notifications reward compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.stateFindUnique.mockResolvedValue(null);
    mocks.receiptFindMany.mockResolvedValue([]);
    mocks.currencyFindUnique.mockResolvedValue({ unitLabel: "별" });
    mocks.likeCount.mockResolvedValue(0);
    mocks.commentCount.mockResolvedValue(0);
    mocks.rewardCount.mockResolvedValue(1);
    mocks.likeFindMany.mockResolvedValue([]);
    mocks.commentFindMany.mockResolvedValue([]);
    mocks.rewardFindMany.mockResolvedValue([
      {
        id: "transaction-1",
        amount: 25,
        note: "댓글을 남겨 주셔서 고마워요",
        sourceType: "comment_reward",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
      },
    ]);
    mocks.rewardFindFirst.mockResolvedValue({ id: "transaction-1" });
    mocks.receiptUpsert.mockResolvedValue({});
  });

  it("merges reward transactions and formats a readable wallet item", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      items: [
        {
          id: "reward:transaction-1",
          kind: "reward",
          cardTitle: "댓글 보상",
          boardTitle: "내 통장",
          href: "/my/wallet",
          content: "댓글을 남겨 주셔서 고마워요 · +25 별",
          read: false,
        },
      ],
    });
  });

  it("accepts reward receipts by transaction id", async () => {
    const response = await POST(
      new Request("http://localhost/api/student/notifications", {
        method: "POST",
        body: JSON.stringify({
          action: "mark_read",
          kind: "reward",
          id: "transaction-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.receiptUpsert).toHaveBeenCalledWith({
      where: {
        studentId_notificationType_notificationId: {
          studentId: "student-1",
          notificationType: "reward",
          notificationId: "transaction-1",
        },
      },
      create: {
        studentId: "student-1",
        notificationType: "reward",
        notificationId: "transaction-1",
      },
      update: {},
    });
  });

  it("includes every server-owned activity reward source", async () => {
    mocks.rewardFindMany.mockResolvedValue([
      {
        id: "transaction-attendance",
        amount: 10,
        note: null,
        sourceType: "attendance_reward",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
      },
      {
        id: "transaction-reading-rank",
        amount: 60,
        note: null,
        sourceType: "reading_classroom_rank_reward",
        createdAt: new Date("2026-07-20T00:01:00.000Z"),
      },
    ]);

    const response = await GET();
    const payload = await response.json();
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "reward:transaction-attendance",
        cardTitle: "출석 보상",
      }),
      expect.objectContaining({
        id: "reward:transaction-reading-rank",
        cardTitle: "우리 반 독서 순위 보상",
      }),
    ]));
    expect(mocks.rewardFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: { in: expect.arrayContaining([
            "attendance_reward",
            "reading_weekly_mission_reward",
            "reading_classroom_rank_reward",
          ]) },
        }),
      }),
    );
  });
});
