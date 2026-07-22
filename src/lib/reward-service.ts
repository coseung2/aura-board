import "server-only";

import { Prisma } from "@prisma/client";

import { awardActivityReward, type ActivityRewardResult } from "./creatures/activity-rewards";
import { calculateCatalogSlimeEffects } from "./pets/math";
import {
  DEFAULT_REWARD_POLICY,
  getKstRewardBounds,
  REWARD_EFFECT_BY_AREA,
  REWARD_SOURCE_TYPES,
  rewardAmountWithBuff,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
  type RewardArea,
  type RewardPolicy,
} from "./reward-policy";

export type PolicyRewardResult = ActivityRewardResult & {
  baseAmount: number;
  buffBps: number;
};

function positiveOrDefault(value: number | null | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

export async function loadRewardPolicy(
  tx: Prisma.TransactionClient,
  classroomId: string,
): Promise<RewardPolicy> {
  const row = await tx.avatarRewardConfig.findUnique({ where: { classroomId } });
  const policy = {} as RewardPolicy;
  for (const key of Object.keys(DEFAULT_REWARD_POLICY) as Array<keyof RewardPolicy>) {
    policy[key] = positiveOrDefault(row?.[key], DEFAULT_REWARD_POLICY[key]);
  }
  // Product guardrails are hard limits even if an older/admin row contains
  // larger values. Amounts and score thresholds remain classroom-configurable.
  policy.readingDailyRewardCap = Math.min(policy.readingDailyRewardCap, 10);
  policy.readingWeeklyRewardCap = Math.min(policy.readingWeeklyRewardCap, 20);
  policy.commentDailyRewardCap = Math.min(policy.commentDailyRewardCap, 10);
  policy.commentWeeklyRewardCap = Math.min(policy.commentWeeklyRewardCap, 30);
  // Assignment caps use zero as the explicit unlimited value. Positive
  // classroom overrides remain supported for deployments that still want a
  // local throttle; the product default is unlimited per valid submission.
  policy.walkingDailyUnitCap = Math.min(policy.walkingDailyUnitCap, 4);
  policy.walkingWeeklyRewardDayCap = Math.min(policy.walkingWeeklyRewardDayCap, 5);
  policy.rewardBuffCapBps = Math.min(policy.rewardBuffCapBps, 2_000);
  return policy;
}

export async function loadEquippedRewardBuffBps(
  tx: Prisma.TransactionClient,
  studentId: string,
  area: RewardArea,
  capBps: number,
): Promise<number> {
  const [slimes, equippedItems] = await Promise.all([
    tx.studentSlime.findMany({
      where: { studentId },
      select: { color: true, isEquipped: true, growthStage: true },
    }),
    tx.studentCreatureItem.findMany({
      where: { studentId, isEquipped: true, quantity: { gt: 0 } },
      select: { itemKey: true },
    }),
  ]);
  const effects = calculateCatalogSlimeEffects(
    slimes.map((slime) => slime.color),
    equippedItems.map((item) => item.itemKey),
    capBps,
    Object.fromEntries(slimes.map((slime) => [slime.color, slime.growthStage])),
  );
  return effects.totals[REWARD_EFFECT_BY_AREA[area]];
}

function capsForArea(area: Exclude<RewardArea, "walking">, policy: RewardPolicy) {
  switch (area) {
    case "reading":
      return { daily: policy.readingDailyRewardCap, weekly: policy.readingWeeklyRewardCap };
    case "comment":
      return { daily: policy.commentDailyRewardCap, weekly: policy.commentWeeklyRewardCap };
    case "assignment":
      return { daily: policy.assignmentDailyRewardCap, weekly: policy.assignmentWeeklyRewardCap };
  }
}

export async function awardCappedPolicyReward(input: {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  area: Exclude<RewardArea, "walking">;
  sourceRef: string;
  baseAmount: number;
  note: string;
  now?: Date;
  policy?: RewardPolicy;
}): Promise<PolicyRewardResult | null> {
  const sourceType = REWARD_SOURCE_TYPES[input.area];
  const existing = await input.tx.transaction.findFirst({
    where: { sourceType, sourceRef: input.sourceRef, type: "deposit" },
    select: { id: true, accountId: true, amount: true },
  });
  if (existing) {
    const replay = await awardActivityReward({
      tx: input.tx,
      studentId: input.studentId,
      classroomId: input.classroomId,
      accountId: input.accountId,
      sourceType,
      sourceRef: input.sourceRef,
      amount: existing.amount,
      note: input.note,
    });
    return { ...replay, baseAmount: input.baseAmount, buffBps: 0 };
  }

  const policy = input.policy ?? await loadRewardPolicy(input.tx, input.classroomId);
  const caps = capsForArea(input.area, policy);
  if (input.baseAmount <= 0) return null;
  // Reading/comment zero values are a disable switch. Assignment zero means
  // unlimited, so only positive configured dimensions participate in the
  // count gate below.
  if (input.area !== "assignment" && (caps.daily <= 0 || caps.weekly <= 0)) return null;
  const bounds = getKstRewardBounds(input.now);
  const [dailyCount, weeklyCount] = await Promise.all([
    input.tx.transaction.count({
      where: {
        accountId: input.accountId,
        sourceType,
        type: "deposit",
        createdAt: { gte: bounds.dayStart, lt: bounds.dayEnd },
      },
    }),
    input.tx.transaction.count({
      where: {
        accountId: input.accountId,
        sourceType,
        type: "deposit",
        createdAt: { gte: bounds.weekStart, lt: bounds.weekEnd },
      },
    }),
  ]);
  if ((caps.daily > 0 && dailyCount >= caps.daily) ||
      (caps.weekly > 0 && weeklyCount >= caps.weekly)) return null;

  const buffBps = await loadEquippedRewardBuffBps(
    input.tx,
    input.studentId,
    input.area,
    policy.rewardBuffCapBps,
  );
  const amount = rewardAmountWithBuff(input.baseAmount, buffBps, policy.rewardBuffCapBps);
  const result = await awardActivityReward({
    tx: input.tx,
    studentId: input.studentId,
    classroomId: input.classroomId,
    accountId: input.accountId,
    sourceType,
    sourceRef: input.sourceRef,
    amount,
    note: input.note,
  });
  return { ...result, baseAmount: input.baseAmount, buffBps };
}

export async function awardWalkingPolicyReward(input: {
  tx: Prisma.TransactionClient;
  studentId: string;
  classroomId: string;
  accountId: string;
  sourceRef: string;
  baseAmount: number;
  note: string;
  policy: RewardPolicy;
  sourceType?: typeof REWARD_SOURCE_TYPES.walking | typeof WALKING_WEEKLY_REWARD_SOURCE_TYPE;
}): Promise<PolicyRewardResult | null> {
  const sourceType = input.sourceType ?? REWARD_SOURCE_TYPES.walking;
  const existing = await input.tx.transaction.findFirst({
    where: {
      sourceType,
      sourceRef: input.sourceRef,
      type: "deposit",
    },
    select: { amount: true },
  });
  if (input.baseAmount <= 0 && !existing) return null;
  if (existing) {
    const replay = await awardActivityReward({
      tx: input.tx,
      studentId: input.studentId,
      classroomId: input.classroomId,
      accountId: input.accountId,
      sourceType,
      sourceRef: input.sourceRef,
      amount: existing.amount,
      note: input.note,
    });
    return { ...replay, baseAmount: input.baseAmount, buffBps: 0 };
  }
  const buffBps = await loadEquippedRewardBuffBps(
    input.tx,
    input.studentId,
    "walking",
    input.policy.rewardBuffCapBps,
  );
  const amount = rewardAmountWithBuff(
    input.baseAmount,
    buffBps,
    input.policy.rewardBuffCapBps,
  );
  const result = await awardActivityReward({
    tx: input.tx,
    studentId: input.studentId,
    classroomId: input.classroomId,
    accountId: input.accountId,
    sourceType,
    sourceRef: input.sourceRef,
    amount,
    note: input.note,
  });
  return { ...result, baseAmount: input.baseAmount, buffBps };
}
