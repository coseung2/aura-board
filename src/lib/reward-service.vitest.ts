import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  award: vi.fn(),
  cachedPolicyFind: vi.fn(),
}));

vi.mock("./creatures/activity-rewards", () => ({
  awardActivityReward: mocks.award,
}));

vi.mock("./db", () => ({
  db: {
    avatarRewardConfig: { findUnique: mocks.cachedPolicyFind },
  },
}));

import {
  awardCappedPolicyReward,
  awardReadingPolicyReward,
  awardWalkingPolicyReward,
  createCommentWithPreparedRewardContext,
  invalidateRewardPolicyCache,
  loadRewardPolicy,
  loadRewardPolicyCached,
  lockRewardAccount,
} from "./reward-service";
import {
  DEFAULT_REWARD_POLICY,
  READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
} from "./reward-policy";

function fakeTx(
  counts: number[] = [0, 0],
  colors: string[] = [],
  rewardConfig: Record<string, number> | null = null,
  equippedItemKeys: string[] = [],
  hasActiveCreature = false,
) {
  const [dailyCount = 0, weeklyCount = 0] = counts;
  return {
    avatarRewardConfig: { findUnique: vi.fn(async () => rewardConfig) },
    $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) => {
      const sql = query.strings?.join(" ") ?? "";
      if (sql.includes('FROM "Transaction"')) {
        return [{ daily_count: dailyCount, weekly_count: weeklyCount }];
      }
      return [{
        slimes: colors.map((color) => ({
          color,
          growthStage: 1,
          equippedTitleKey: null,
        })),
        item_keys: equippedItemKeys,
        has_active_creature: hasActiveCreature,
      }];
    }),
    transaction: {
      findFirst: vi.fn(async () => null),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("reward account locking", () => {
  it("locks exactly one StudentAccount row for the transaction", async () => {
    const queryRaw = vi.fn(async () => [{ id: "account-1" }]);
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;

    await expect(lockRewardAccount(tx, "account-1")).resolves.toBeUndefined();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    expect(query.strings.join("?")).toContain(
      'SELECT "id" FROM "StudentAccount" WHERE "id" = ? FOR UPDATE',
    );
    expect(query.values).toEqual(["account-1"]);
  });

  it("fails closed when the reward account disappeared", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
    } as unknown as Prisma.TransactionClient;

    await expect(lockRewardAccount(tx, "missing-account")).rejects.toThrow(
      "Reward account not found",
    );
  });
});

describe("combined student comment preparation", () => {
  it("maps the inserted comment and locked reward gates from one CTE result", async () => {
    const queryRaw = vi.fn(async () => [
      {
        account_found: true,
        duplicate: false,
        daily_count: 2,
        weekly_count: 7,
        slimes: [],
        item_keys: [],
        has_active_creature: true,
        comment_id: "comment-1",
        comment_parent_comment_id: null,
        comment_content: "정말 좋은 글이에요",
        comment_created_at: new Date("2026-07-20T00:00:00.000Z"),
        comment_author_kind: "student",
        comment_audience: "public",
        comment_author_parent_id: null,
        comment_author_student_id: "student-1",
      },
    ]);
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;

    const result = await createCommentWithPreparedRewardContext(tx, {
      cardId: "card-1",
      parentCommentId: null,
      audience: "public",
      clientRequestId: "request-0001",
      content: "정말 좋은 글이에요",
      accountId: "account-1",
      studentId: "student-1",
      classroomId: "classroom-1",
      normalizedContent: "정말 좋은 글이에요",
      policy: {
        ...DEFAULT_REWARD_POLICY,
        commentMinMeaningfulLength: 4,
        commentRewardAmount: 5,
        rewardBuffCapBps: Number.MAX_SAFE_INTEGER,
      },
    });

    expect(result).toEqual({
      created: {
        id: "comment-1",
        parentCommentId: null,
        content: "정말 좋은 글이에요",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        authorKind: "student",
        audience: "public",
        authorParentId: null,
        authorStudentId: "student-1",
      },
      preparedReward: {
        duplicate: false,
        counts: { daily: 2, weekly: 7 },
        rewardContext: { buffBps: 0, hasActiveCreature: true },
      },
    });
    const sql = String(
      (queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(" "),
    );
    expect(sql).toContain('WITH locked_account AS MATERIALIZED');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('INSERT INTO "CardComment"');
  });
});

describe("reward policy cache", () => {
  beforeEach(() => {
    invalidateRewardPolicyCache();
    mocks.cachedPolicyFind.mockReset();
  });

  it("deduplicates simultaneous classroom policy reads", async () => {
    mocks.cachedPolicyFind.mockResolvedValue({ commentRewardAmount: 7 });

    const [first, second] = await Promise.all([
      loadRewardPolicyCached("classroom-1"),
      loadRewardPolicyCached("classroom-1"),
    ]);
    const third = await loadRewardPolicyCached("classroom-1");

    expect(first.commentRewardAmount).toBe(7);
    expect(second.commentRewardAmount).toBe(7);
    expect(third.commentRewardAmount).toBe(7);
    expect(mocks.cachedPolicyFind).toHaveBeenCalledTimes(1);
  });

  it("reloads after explicit invalidation", async () => {
    mocks.cachedPolicyFind
      .mockResolvedValueOnce({ commentRewardAmount: 5 })
      .mockResolvedValueOnce({ commentRewardAmount: 9 });

    await expect(loadRewardPolicyCached("classroom-1")).resolves.toMatchObject({
      commentRewardAmount: 5,
    });
    invalidateRewardPolicyCache("classroom-1");
    await expect(loadRewardPolicyCached("classroom-1")).resolves.toMatchObject({
      commentRewardAmount: 9,
    });
    expect(mocks.cachedPolicyFind).toHaveBeenCalledTimes(2);
  });
});

describe("reward service caps and buffs", () => {
  beforeEach(() => {
    invalidateRewardPolicyCache();
    mocks.cachedPolicyFind.mockReset();
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

  it("applies an equipped scene background through the existing item lookup", async () => {
    const tx = fakeTx(
      [0, 0],
      [],
      null,
      ["jellyfish-ocean-background"],
    );
    const result = await awardCappedPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      area: "reading",
      sourceRef: "reading-background-1",
      baseAmount: 100,
      note: "독서 기록 보상",
    });

    expect(result).toMatchObject({ baseAmount: 100, buffBps: 300, amount: 103 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
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
      // Buff ceilings were retired, so a stored value no longer clamps payouts.
      rewardBuffCapBps: Number.MAX_SAFE_INTEGER,
    });
  });

  it("treats zero assignment caps as unlimited with one combined count query", async () => {
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
    const sqlCalls = (tx.$queryRaw as ReturnType<typeof vi.fn>).mock.calls.map(
      ([query]) => (query as { strings?: readonly string[] }).strings?.join(" ") ?? "",
    );
    expect(sqlCalls.filter((sql) => sql.includes('FROM "Transaction"'))).toHaveLength(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
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

  it("records a reading classroom rank in its own reading-buff namespace", async () => {
    const tx = fakeTx();
    const policy = await loadRewardPolicy(tx, "classroom-1");
    await awardReadingPolicyReward({
      tx,
      studentId: "student-1",
      classroomId: "classroom-1",
      accountId: "account-1",
      sourceRef: "student-1:2026-07-13:reading-classroom-rank",
      sourceType: READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
      baseAmount: 60,
      note: "독서 반 랭킹 2위 보상",
      policy,
    });
    expect(mocks.award).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "reading_classroom_rank_reward",
        sourceRef: "student-1:2026-07-13:reading-classroom-rank",
        amount: 60,
      }),
    );
  });
});
