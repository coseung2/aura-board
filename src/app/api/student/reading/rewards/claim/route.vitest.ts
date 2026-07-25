import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  award: vi.fn(),
  rankAward: vi.fn(),
  queryRaw: vi.fn(),
  deposits: [] as Array<{ sourceRef: string; accountId: string }>,
  logs: [{ createdAt: new Date("2026-07-20T03:00:00.000Z"), reflection: "감상" }],
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(async () => ({
    id: "student-1",
    classroomId: "classroom-1",
  })),
}));
vi.mock("@/lib/bank", () => ({
  ensureAccountFor: vi.fn(async () => ({ accountId: "account-1" })),
}));
vi.mock("@/lib/creatures/activity-rewards", () => ({
  retryActivityRewardTransaction: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("@/lib/reward-policy", () => ({
  getKstClassroomWalkingRankPeriods: () => ({
    active: { weekStart: "2026-07-20", weekEnd: "2026-07-27" },
  }),
  getKstClassroomWalkingRankRewardPeriods: () => [
    { weekStart: "2026-07-13", weekEnd: "2026-07-20" },
  ],
  readingClassroomRankRewardSourceRef: (studentId: string, weekStart: string) =>
    `${studentId}:${weekStart}:reading-classroom-rank`,
  READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE: "reading_classroom_rank_reward",
  READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE: "reading_weekly_mission_reward",
  WALKING_CLASSROOM_RANK_REWARDS: [100, 60, 50, 40, 30],
  readingWeeklyMissionSourceRef: (
    studentId: string,
    weekStart: string,
    missionKey?: string,
  ) => `${studentId}:${weekStart}:reading-weekly-mission${missionKey ? `:${missionKey}` : ""}`,
}));
vi.mock("@/lib/reward-service", () => ({
  loadRewardPolicy: vi.fn(async () => ({ rewardBuffCapBps: 0 })),
  awardReadingPolicyReward: mocks.rankAward,
  awardReadingWeeklyMissionReward: mocks.award,
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    readingLog: { findMany: vi.fn(async () => mocks.logs) },
    transaction: { findMany: vi.fn(async () => mocks.deposits) },
  };
  return {
    db: {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
      ),
      transaction: { findFirst: vi.fn(async () => null) },
    },
  };
});

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/student/reading/rewards/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("reading mission step claims", () => {
  beforeEach(() => {
    mocks.deposits.length = 0;
    mocks.award.mockReset();
    mocks.rankAward.mockReset();
    mocks.queryRaw.mockReset();
    mocks.award.mockResolvedValue({ amount: 10, idempotent: false });
    mocks.rankAward.mockResolvedValue({ amount: 60, idempotent: false });
    mocks.queryRaw.mockResolvedValue([{ rank: 2 }]);
  });

  it("claims one achieved unit with its stable source reference", async () => {
    const response = await POST(request({ missionKey: "weekly_books", unit: 1 }) as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      missionKey: "weekly_books",
      unit: 1,
      step: { unit: 1, target: 1, amount: 10, claimed: true, claimable: false },
      rewardAmount: 10,
      idempotent: false,
    });
    expect(mocks.award).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: "student-1:2026-07-20:reading-weekly-mission:weekly_books:unit:1",
        baseAmount: 10,
      }),
    );
  });

  it("rejects an unachieved unit without awarding it", async () => {
    const response = await POST(request({ missionKey: "weekly_books", unit: 2 }) as never);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "reward_not_achieved",
      missionKey: "weekly_books",
      unit: 2,
      step: { achieved: false, claimable: false },
    });
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("treats a legacy mission payout as an idempotent claim", async () => {
    mocks.deposits.push({
      sourceRef: "student-1:2026-07-20:reading-weekly-mission:weekly_books",
      accountId: "account-1",
    });
    const response = await POST(request({ missionKey: "weekly_books", unit: 1 }) as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      step: { claimed: true, claimable: false },
      rewardAmount: 10,
      idempotent: true,
    });
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("claims a prior-week Top 5 reading rank with its own source namespace", async () => {
    const response = await POST(
      request({ kind: "classroom_rank", weekStart: "2026-07-13" }) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      classroomRankReward: {
        weekStart: "2026-07-13",
        rank: 2,
        amount: 60,
        claimed: true,
      },
      rewardAmount: 60,
      idempotent: false,
    });
    expect(mocks.rankAward).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "reading_classroom_rank_reward",
        sourceRef: "student-1:2026-07-13:reading-classroom-rank",
        baseAmount: 60,
      }),
    );
  });

  it("rejects reading ranks outside the Top 5", async () => {
    mocks.queryRaw.mockResolvedValue([{ rank: 6 }]);
    const response = await POST(
      request({ kind: "classroom_rank", weekStart: "2026-07-13" }) as never,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "classroom_rank_reward_not_eligible",
      rank: 6,
    });
    expect(mocks.rankAward).not.toHaveBeenCalled();
  });
});
