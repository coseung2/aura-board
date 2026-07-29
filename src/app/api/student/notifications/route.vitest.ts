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
  refundCount: vi.fn(),
  refundFindMany: vi.fn(),
  refundFindFirst: vi.fn(),
  pushCount: vi.fn(),
  pushFindMany: vi.fn(),
  pushFindFirst: vi.fn(),
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
      // Rewards and refunds share the transaction table but never the same
      // `type`, so the fake client routes on it exactly like the real query does.
      count: (args: { where?: { type?: string } }) =>
        args?.where?.type === "refund" ? mocks.refundCount(args) : mocks.rewardCount(args),
      findMany: (args: { where?: { type?: string } }) =>
        args?.where?.type === "refund" ? mocks.refundFindMany(args) : mocks.rewardFindMany(args),
      findFirst: (args: { where?: { type?: string } }) =>
        args?.where?.type === "refund" ? mocks.refundFindFirst(args) : mocks.rewardFindFirst(args),
    },
    studentPushDispatch: {
      count: mocks.pushCount,
      findMany: mocks.pushFindMany,
      findFirst: mocks.pushFindFirst,
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
    mocks.refundCount.mockResolvedValue(0);
    mocks.pushCount.mockResolvedValue(0);
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
    mocks.refundFindMany.mockResolvedValue([]);
    mocks.refundFindFirst.mockResolvedValue(null);
    mocks.pushFindMany.mockResolvedValue([]);
    mocks.pushFindFirst.mockResolvedValue(null);
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

  it("tells the student when a retired item was refunded", async () => {
    mocks.rewardCount.mockResolvedValue(0);
    mocks.rewardFindMany.mockResolvedValue([]);
    mocks.refundCount.mockResolvedValue(1);
    mocks.refundFindMany.mockResolvedValue([
      {
        id: "transaction-refund-1",
        amount: 500,
        note: "slime-item-refund:water-puddle-background",
        sourceType: "slime_item_refund",
        createdAt: new Date("2026-07-28T00:00:00.000Z"),
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      count: number;
      items: { id: string; kind: string; cardTitle: string; content: string; href: string }[];
    };
    expect(payload.count).toBe(1);
    expect(payload.items[0]).toMatchObject({
      id: "refund:transaction-refund-1",
      kind: "refund",
      actorLabel: "펫 상점",
      href: "/my/wallet",
    });
    // The item is gone from the catalog, so the copy must still explain the money
    // without leaking a raw key to a child.
    expect(payload.items[0].cardTitle).toContain("돌려");
    expect(payload.items[0].content).toContain("+500 별");
    expect(payload.items[0].content).not.toContain("water-puddle-background");
  });

  it("accepts refund receipts by transaction id", async () => {
    mocks.refundFindFirst.mockResolvedValue({ id: "transaction-refund-1" });

    const response = await POST(
      new Request("http://localhost/api/student/notifications", {
        method: "POST",
        body: JSON.stringify({
          action: "mark_read",
          kind: "refund",
          id: "transaction-refund-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.receiptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId_notificationType_notificationId: expect.objectContaining({
            notificationType: "refund",
            notificationId: "transaction-refund-1",
          }),
        }),
      }),
    );
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

  it("merges persisted attendance and assignment events and keeps individual read state after reload", async () => {
    const attendanceCreatedAt = new Date("2026-07-26T00:00:00.000Z");
    const assignmentCreatedAt = new Date("2026-07-26T00:01:00.000Z");
    mocks.rewardCount.mockResolvedValue(0);
    mocks.rewardFindMany.mockResolvedValue([]);
    mocks.pushCount.mockResolvedValue(2);
    mocks.pushFindMany.mockResolvedValue([
      {
        id: "dispatch-assignment",
        kind: "assignment",
        title: "새 과제가 도착했어요",
        body: "우리 반 과제를 확인해 주세요.",
        href: "/board/class-homework",
        createdAt: assignmentCreatedAt,
      },
      {
        id: "dispatch-attendance",
        kind: "attendance",
        title: "오늘 출석을 확인해 주세요",
        body: "오늘의 출석을 기록해 주세요.",
        href: "/student",
        createdAt: attendanceCreatedAt,
      },
    ]);
    mocks.pushFindFirst.mockResolvedValue({ id: "dispatch-attendance" });

    const initialResponse = await GET();
    await expect(initialResponse.json()).resolves.toMatchObject({
      count: 2,
      items: [
        expect.objectContaining({
          id: "assignment:dispatch-assignment",
          kind: "assignment",
          href: "/board/class-homework",
          read: false,
        }),
        expect.objectContaining({
          id: "attendance:dispatch-attendance",
          kind: "attendance",
          read: false,
        }),
      ],
    });

    const markResponse = await POST(new Request(
      "http://localhost/api/student/notifications",
      {
        method: "POST",
        body: JSON.stringify({
          action: "mark_read",
          kind: "attendance",
          id: "dispatch-attendance",
        }),
      },
    ));
    expect(markResponse.status).toBe(200);
    expect(mocks.pushFindFirst).toHaveBeenCalledWith({
      where: {
        id: "dispatch-attendance",
        studentId: "student-1",
        kind: "attendance",
      },
      select: { id: true },
    });

    mocks.receiptFindMany.mockResolvedValue([{
      notificationType: "attendance",
      notificationId: "dispatch-attendance",
    }]);
    mocks.pushCount.mockResolvedValue(1);
    const reloadResponse = await GET();
    const reloaded = await reloadResponse.json();
    expect(reloaded.count).toBe(1);
    expect(reloaded.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "attendance:dispatch-attendance",
        read: true,
      }),
    ]));
  });

  it("persists mark-all and applies its read cursor on reload", async () => {
    const readAt = new Date("2026-07-26T01:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(readAt);
    mocks.stateUpsert.mockResolvedValue({});

    const markResponse = await POST(new Request(
      "http://localhost/api/student/notifications",
      { method: "POST", body: JSON.stringify({ action: "mark_all_read" }) },
    ));
    expect(markResponse.status).toBe(200);
    expect(mocks.stateUpsert).toHaveBeenCalledWith({
      where: { studentId: "student-1" },
      create: { studentId: "student-1", lastReadAt: readAt },
      update: { lastReadAt: readAt },
    });

    mocks.stateFindUnique.mockResolvedValue({ lastReadAt: readAt });
    mocks.rewardCount.mockResolvedValue(0);
    mocks.rewardFindMany.mockResolvedValue([]);
    mocks.pushCount.mockResolvedValue(0);
    mocks.pushFindMany.mockResolvedValue([{
      id: "dispatch-assignment",
      kind: "assignment",
      title: "새 과제가 도착했어요",
      body: "과제를 확인해 주세요.",
      href: "/board/homework",
      createdAt: new Date("2026-07-26T00:30:00.000Z"),
    }]);

    const reloadResponse = await GET();
    await expect(reloadResponse.json()).resolves.toMatchObject({
      count: 0,
      items: [expect.objectContaining({
        id: "assignment:dispatch-assignment",
        read: true,
      })],
    });
    vi.useRealTimers();
  });
});
