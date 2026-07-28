import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logs: [] as Array<Record<string, unknown>>,
  transactions: [] as Array<Record<string, unknown>>,
  balance: 0,
  award: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
  queryRaw: vi.fn(),
  transactionFindFirst: vi.fn(),
  transactionFindMany: vi.fn(),
  studentSlimeFindFirst: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(async () => ({
    id: "student-1",
    classroomId: "classroom-1",
    name: "학생",
  })),
}));
vi.mock("@/lib/bank", () => ({
  ensureAccountFor: vi.fn(async () => ({ accountId: "account-1", cardId: "card-1" })),
}));
vi.mock("@/lib/reading-evaluator", () => ({
  evaluateReadingLog: vi.fn(() => ({ score: 5, feedback: "좋아요" })),
}));
vi.mock("@/lib/titles", () => ({
  readReadingTitles: vi.fn(async () => []),
}));
vi.mock("@/lib/avatar-rewards", () => ({
  retryReadingRewardTransaction: (operation: () => Promise<unknown>) => operation(),
  awardReadingReward: mocks.award,
}));
vi.mock("@/lib/db", () => {
  const tx = {
    readingLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date("2026-07-20T00:00:00.000Z");
        const row = { id: "reading-1", ...data, createdAt: now, updatedAt: now };
        mocks.logs.push(row);
        return row;
      }),
    },
  };
  return {
    db: {
      readingLog: {
        findMany: mocks.findMany,
        count: mocks.count,
        aggregate: mocks.aggregate,
        create: tx.readingLog.create,
      },
      transaction: {
        findFirst: mocks.transactionFindFirst,
        findMany: mocks.transactionFindMany,
      },
      studentSlime: {
        findFirst: mocks.studentSlimeFindFirst,
      },
      $queryRaw: mocks.queryRaw,
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
        const logSnapshot = [...mocks.logs];
        const transactionSnapshot = [...mocks.transactions];
        const balanceSnapshot = mocks.balance;
        try {
          return await operation(tx);
        } catch (error) {
          mocks.logs.splice(0, mocks.logs.length, ...logSnapshot);
          mocks.transactions.splice(0, mocks.transactions.length, ...transactionSnapshot);
          mocks.balance = balanceSnapshot;
          throw error;
        }
      }),
    },
  };
});

import { GET, POST } from "./route";

function request() {
  return new Request("http://localhost/api/student/reading", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bookType: "story",
      title: "어린 왕자",
      author: "생텍쥐페리",
      reflection: "친구를 소중하게 생각해야 한다고 느꼈어요.",
    }),
  });
}

describe("reading log and reward transaction", () => {
  beforeEach(() => {
    mocks.logs.length = 0;
    mocks.transactions.length = 0;
    mocks.balance = 0;
    mocks.award.mockReset();
    mocks.findMany.mockReset();
    mocks.count.mockReset();
    mocks.aggregate.mockReset();
    mocks.queryRaw.mockReset();
    mocks.transactionFindFirst.mockReset();
    mocks.transactionFindMany.mockReset();
    mocks.studentSlimeFindFirst.mockReset();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transactionFindFirst.mockResolvedValue(null);
    mocks.transactionFindMany.mockResolvedValue([]);
    mocks.studentSlimeFindFirst.mockResolvedValue(null);
  });

  it("rolls the reading log, wallet, and transaction back together", async () => {
    mocks.award.mockImplementationOnce(async ({ tx }: { tx?: unknown }) => {
      expect(tx).toBeDefined();
      mocks.balance += 25;
      mocks.transactions.push({ sourceType: "reading_reward", amount: 25 });
      throw new Error("reward transaction failed");
    });

    await expect(POST(request())).rejects.toThrow("reward transaction failed");
    expect(mocks.logs).toHaveLength(0);
    expect(mocks.balance).toBe(0);
    expect(mocks.transactions).toHaveLength(0);
  });

  it("uses complete aggregates while capping the returned recent entries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    const recentRows = Array.from({ length: 30 }, (_, index) => {
      const now = new Date("2026-07-20T00:00:00.000Z");
      return {
        id: `reading-${index}`,
        classroomId: "classroom-1",
        studentId: "student-1",
        bookType: "story",
        title: `책 ${index}`,
        author: "작가",
        reflection: "감상",
        aiScore: index === 0 ? 5 : null,
        aiFeedback: null,
        evaluatedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });
    mocks.findMany
      .mockResolvedValueOnce(recentRows)
      .mockResolvedValueOnce(recentRows.slice(0, 4));
    mocks.count.mockResolvedValueOnce(31).mockResolvedValueOnce(4);
    mocks.aggregate.mockResolvedValue({ _avg: { aiScore: 4.25 } });

    try {
      const response = await GET();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.entries).toHaveLength(30);
      expect(body.count).toBe(31);
      expect(body.summary).toEqual({
        weeklyCount: 4,
        totalCount: 31,
        averageScore: 4.3,
      });
      expect(body.missions.map((mission: { key: string }) => mission.key)).toEqual([
        "weekly_books",
        "consecutive_days",
        "reflection_chars",
      ]);
      expect(body.missions[0].progress).toBe(4);
      expect(body.weeklyMissionReward).toMatchObject({
        totalCount: 3,
        completedCount: expect.any(Number),
        claimed: false,
        claimable: true,
        claimableStepCount: 5,
        claimableAmount: 50,
      });
      expect(body.representativeSlime).toBeNull();
      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 30 }),
      );
      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { createdAt: true, reflection: true },
        }),
      );
      expect(mocks.count).toHaveBeenCalledTimes(2);
      expect(mocks.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ _avg: { aiScore: true } }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns Top 5 reward amounts and prior-week unclaimed reading rank rewards", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T03:00:00.000Z"));
    const recentRows: Array<Record<string, unknown>> = [];
    mocks.findMany.mockResolvedValueOnce(recentRows).mockResolvedValueOnce([]);
    mocks.count.mockResolvedValue(0);
    mocks.aggregate.mockResolvedValue({ _avg: { aiScore: null } });
    mocks.queryRaw.mockImplementation(async (query: { strings?: TemplateStringsArray }) => {
      const source = query.strings?.join("?") ?? "";
      if (source.includes('AS "weeklyCount"')) {
        return [
          {
            studentId: "student-2",
            studentNumber: 4,
            studentName: "김하늘",
            weeklyCount: BigInt(8),
          },
          {
            studentId: "student-1",
            studentNumber: 25,
            studentName: "학생",
            weeklyCount: BigInt(5),
          },
        ];
      }
      if (source.includes('SELECT "rank"')) return [{ rank: 2 }];
      return [];
    });

    try {
      const response = await GET();
      const body = await response.json();

      expect(body.classroomTopFive).toEqual([
        {
          studentId: "student-2",
          studentNumber: 4,
          studentName: "김하늘",
          weeklyCount: 8,
          isCurrent: false,
          rewardAmount: 100,
        },
        {
          studentId: "student-1",
          studentNumber: 25,
          studentName: "학생",
          weeklyCount: 5,
          isCurrent: true,
          rewardAmount: 60,
        },
      ]);
      expect(body.classroomRankRewards).toEqual([
        { weekStart: "2026-07-13", rank: 2, amount: 60 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
