import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ award: vi.fn() }));

vi.mock("./creatures/activity-rewards", () => ({
  awardActivityReward: mocks.award,
}));

import {
  awardCappedPolicyReward,
  awardWalkingPolicyReward,
  loadRewardPolicy,
} from "./reward-service";
import { WALKING_WEEKLY_REWARD_SOURCE_TYPE } from "./reward-policy";

function fakeTx(
  counts: number[] = [0, 0],
  colors: string[] = [],
  rewardConfig: Record<string, number> | null = null,
) {
  return {
    avatarRewardConfig: { findUnique: vi.fn(async () => rewardConfig) },
    transaction: {
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => counts.shift() ?? 0),
    },
    studentSlime: {
      findMany: vi.fn(async () => colors.map((color) => ({ color }))),
    },
    studentCreatureItem: { findMany: vi.fn(async () => []) },
  } as unknown as Prisma.TransactionClient;
}

describe("reward service caps and buffs", () => {
  beforeEach(() => {
    mocks.award.mockReset();
    mocks.award.mockImplementation(async (input: { amount: number }) => ({
      transactionId: "transaction-1",
      amount: input.amount,
      idempotent: false,
      progress: { progressEventId: null, progressDelta: 0, stageBefore: null, stageAfter: null },
    }));
  });

  it("stops a second reading reward in the same KST day", async () => {
    const tx = fakeTx([10, 10]);
    const result = await awardCappedPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      area: "reading",
      sourceRef: "reading-2",
      baseAmount: 25,
      note: "독서 기록 보상",
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    expect(result).toBeNull();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("stops a third assignment reward in the same KST week", async () => {
    const tx = fakeTx([0, 2], [], { assignmentDailyRewardCap: 1, assignmentWeeklyRewardCap: 2 });
    const result = await awardCappedPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      area: "assignment",
      sourceRef: "assignment-3",
      baseAmount: 20,
      note: "과제 첫 제출 보상",
    });
    expect(result).toBeNull();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("uses only equipped catalog effects and floors the payout", async () => {
    const tx = fakeTx([0, 0], ["green"]);
    const result = await awardCappedPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      area: "reading",
      sourceRef: "reading-1",
      baseAmount: 51,
      note: "독서 기록 보상",
    });
    expect(result).toMatchObject({ baseAmount: 51, buffBps: 200, amount: 52 });
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({ amount: 52 }));
  });

  it("hard-clamps configurable frequency and buff guardrails", async () => {
    const tx = fakeTx();
    (tx.avatarRewardConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      readingDailyRewardCap: 99,
      readingWeeklyRewardCap: 99,
      commentDailyRewardCap: 99,
      commentWeeklyRewardCap: 99,
      assignmentDailyRewardCap: 99,
      assignmentWeeklyRewardCap: 99,
      walkingDailyUnitCap: 99,
      walkingWeeklyRewardDayCap: 99,
      rewardBuffCapBps: 99_999,
    });
    await expect(loadRewardPolicy(tx, "classroom-1")).resolves.toMatchObject({
      readingDailyRewardCap: 10,
      readingWeeklyRewardCap: 20,
      commentDailyRewardCap: 10,
      commentWeeklyRewardCap: 30,
      assignmentDailyRewardCap: 99,
      assignmentWeeklyRewardCap: 99,
      walkingDailyUnitCap: 4,
      walkingWeeklyRewardDayCap: 5,
      rewardBuffCapBps: 2_000,
    });
  });

  it("treats zero assignment caps as unlimited while preserving count queries", async () => {
    const tx = fakeTx([10, 20]);
    const policy = await loadRewardPolicy(tx, "classroom-1");
    const result = await awardCappedPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      area: "assignment",
      sourceRef: "assignment-attempt-3",
      baseAmount: 20,
      note: "과제 제출 보상",
      policy,
    });
    expect(result).toMatchObject({ amount: 20, baseAmount: 20 });
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({ amount: 20 }));
    expect(tx.transaction.count).toHaveBeenCalledTimes(2);
  });

  it("treats a disabled zero-amount policy as no payout", async () => {
    const tx = fakeTx([0, 0]);
    await expect(
      awardCappedPolicyReward({
        tx,
        studentId: "student-1",
        classroomId: "classroom-1",
        accountId: "account-1",
        area: "comment",
        sourceRef: "comment-disabled",
        baseAmount: 0,
        note: "댓글 작성 보상",
      }),
    ).resolves.toBeNull();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("records the weekly walking goal in its own source namespace", async () => {
    const tx = fakeTx();
    const policy = await loadRewardPolicy(tx, "classroom-1");
    await awardWalkingPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      sourceRef: "student-1:2026-07-20:weekly-goal",
      sourceType: WALKING_WEEKLY_REWARD_SOURCE_TYPE,
      baseAmount: 20,
      note: "주간 걷기 달성 보상",
      policy,
    });
    expect(mocks.award).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "walking_weekly_reward" }),
    );
  });
});
