import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { ensureAccountFor } from "@/lib/bank";
import { db } from "@/lib/db";
import {
  awardWalkingPolicyReward,
  loadRewardPolicy,
} from "@/lib/reward-service";
import { retryActivityRewardTransaction } from "@/lib/creatures/activity-rewards";
import {
  canRewardWalkingDay,
  walkingClassroomRankRewardSourceRef,
  getKstClassroomWalkingRankPeriods,
  getKstClassroomWalkingRankRewardPeriods,
  getKstRewardWeekRange,
  getWalkingWeeklyRewardTiers,
  getKstWeekStartDay,
  toKstDayKey,
  walkingRewardUnits,
  walkingUnitSourceRef,
  walkingWeeklyGoalSourceRef,
  walkingWeeklyTierSourceRef,
  WALKING_CLASSROOM_RANK_REWARDS,
  WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
} from "@/lib/reward-policy";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const claimSchema = z.union([
  z.object({ kind: z.literal("daily"), unit: z.number().int().min(1).max(4) }),
  z.object({ kind: z.literal("weekly"), tierKey: z.enum(["tier1", "tier2", "tier3"]) }),
  z.object({
    kind: z.literal("classroom_rank"),
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({ tierKey: z.enum(["tier1", "tier2", "tier3"]) }).transform((value) => ({
    kind: "weekly" as const,
    ...value,
  })),
]);

type ClaimTierResult = {
  status: "claimed";
  tier: {
    key: string;
    steps: number;
    amount: number;
    achieved: true;
    claimed: true;
  };
  rewardAmount: number;
  idempotent: boolean;
};

type NotAchievedResult = {
  status: "not_achieved";
  tier: {
    key: string;
    steps: number;
    amount: number;
    achieved: false;
    claimed: boolean;
  };
  totalSteps: number;
  weekStart: string;
};

type ClaimResult = ClaimTierResult | NotAchievedResult;

type ClaimDailyResult = {
  status: "claimed";
  tier: {
    unit: number;
    steps: number;
    amount: number;
    achieved: true;
    claimed: true;
    claimable: false;
  };
  rewardAmount: number;
  idempotent: boolean;
};

type DailyNotAchievedResult = {
  status: "not_achieved";
  tier: {
    unit: number;
    steps: number;
    amount: number;
    achieved: false;
    claimed: boolean;
    claimable: false;
  };
  totalSteps: number;
  day: string;
};

type ClassroomRankRewardResult = {
  status: "claimed";
  weekStart: string;
  rank: number;
  amount: number;
  claimed: true;
  rewardAmount: number;
  idempotent: boolean;
};

type ClassroomRankNotEligibleResult = {
  status: "not_eligible";
  rank: number | null;
};

async function readCurrentWeekSteps(
  tx: Prisma.TransactionClient,
  studentId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const totals = await tx.$queryRaw<Array<{ steps: bigint | number | null }>>(Prisma.sql`
    SELECT SUM("steps") AS "steps"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= ${weekStart}::date
      AND "day" < ${weekEnd}::date
  `);
  const raw = Number(totals[0]?.steps ?? 0);
  return Number.isSafeInteger(raw) ? Math.max(0, raw) : 0;
}

async function readCurrentDaySteps(
  tx: Prisma.TransactionClient,
  studentId: string,
  day: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ steps: bigint | number | null }>>(Prisma.sql`
    SELECT MAX("steps") AS "steps"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" = ${day}::date
  `);
  const raw = Number(rows[0]?.steps ?? 0);
  return Number.isSafeInteger(raw) ? Math.max(0, raw) : 0;
}

async function readCurrentClassroomRank(
  tx: Prisma.TransactionClient,
  classroomId: string,
  studentId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number | null> {
  const rows = await tx.$queryRaw<Array<{ rank: bigint | number }>>(Prisma.sql`
    WITH ranked AS (
      SELECT
        student."id" AS "studentId",
        ROW_NUMBER() OVER (
          ORDER BY
            COALESCE(SUM(walking."steps"), 0) DESC,
            student."number" ASC NULLS LAST,
            student."name" ASC
        ) AS "rank"
      FROM "Student" student
      LEFT JOIN "StudentWalkingDailyStat" walking
        ON walking."studentId" = student."id"
        AND walking."day" >= ${weekStart}::date
        AND walking."day" < ${weekEnd}::date
      WHERE student."classroomId" = ${classroomId}
      GROUP BY student."id", student."number", student."name"
      HAVING COALESCE(SUM(walking."steps"), 0) > 0
    )
    SELECT "rank"
    FROM ranked
    WHERE "studentId" = ${studentId}
  `);
  const rank = Number(rows[0]?.rank);
  return Number.isSafeInteger(rank) && rank > 0 ? rank : null;
}

async function claimClassroomRankReward(input: {
  student: { id: string; classroomId: string };
  accountId: string;
  weekStart: string;
}): Promise<ClassroomRankRewardResult | ClassroomRankNotEligibleResult> {
  const range = getKstClassroomRankRewardPeriod(input.weekStart);
  if (!range) return { status: "not_eligible", rank: null };
  const sourceRef = walkingClassroomRankRewardSourceRef(input.student.id, range.weekStart);

  return retryActivityRewardTransaction(
    () =>
      db.$transaction(
        async (tx) => {
          const rank = await readCurrentClassroomRank(
            tx,
            input.student.classroomId,
            input.student.id,
            range.weekStart,
            range.weekEnd,
          );
          const amount = rank ? WALKING_CLASSROOM_RANK_REWARDS[rank - 1] : undefined;
          if (rank === null || amount === undefined) {
            return { status: "not_eligible" as const, rank } satisfies ClassroomRankNotEligibleResult;
          }

          const policy = await loadRewardPolicy(tx, input.student.classroomId);
          const reward = await awardWalkingPolicyReward({
            tx,
            studentId: input.student.id,
            classroomId: input.student.classroomId,
            accountId: input.accountId,
            sourceType: WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
            sourceRef,
            baseAmount: amount,
            note: `우리 반 걷기 ${rank}등 보상 [${range.weekStart}]`,
            policy,
          });
          if (!reward) throw new Error("walking_classroom_rank_reward_unavailable");
          return {
            status: "claimed" as const,
            weekStart: range.weekStart,
            rank,
            amount,
            claimed: true as const,
            rewardAmount: reward.amount,
            idempotent: reward.idempotent,
          } satisfies ClassroomRankRewardResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    3,
    async (error) => {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        return false;
      }
      const target = (error.meta as { target?: unknown } | undefined)?.target;
      if (
        !(
          (Array.isArray(target) && target.includes("sourceType")) ||
          String(target ?? "").includes("sourceType")
        )
      ) {
        return false;
      }
      const raced = await db.transaction.findFirst({
        where: {
          sourceType: WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
          sourceRef,
          type: "deposit",
        },
        select: { id: true },
      });
      return raced !== null;
    },
  );
}

function getKstClassroomRankRewardPeriod(weekStart: string) {
  return getKstClassroomWalkingRankRewardPeriods().find(
    (period) => period.weekStart === weekStart,
  ) ?? null;
}

async function claimDailyReward(input: {
  student: { id: string; classroomId: string };
  accountId: string;
  unit: number;
}): Promise<ClaimDailyResult | DailyNotAchievedResult> {
  const day = toKstDayKey(new Date());
  const range = getKstRewardWeekRange();
  const sourceRef = walkingUnitSourceRef(input.student.id, day, input.unit);

  return retryActivityRewardTransaction(
    () =>
      db.$transaction(
        async (tx) => {
          const policy = await loadRewardPolicy(tx, input.student.classroomId);
          if (input.unit > policy.walkingDailyUnitCap) {
            throw new Error("walking_daily_unit_missing");
          }

          const totalSteps = await readCurrentDaySteps(tx, input.student.id, day);
          const requiredSteps = policy.walkingRewardStepThreshold * input.unit;
          const achieved = walkingRewardUnits(
            totalSteps,
            policy.walkingRewardStepThreshold,
            policy.walkingDailyUnitCap,
          ) >= input.unit;
          if (!achieved) {
            return {
              status: "not_achieved" as const,
              tier: {
                unit: input.unit,
                steps: requiredSteps,
                amount: policy.walkingRewardAmount,
                achieved: false as const,
                claimed: false,
                claimable: false,
              },
              totalSteps,
              day,
            } satisfies DailyNotAchievedResult;
          }

          const previous = await tx.transaction.findMany({
            where: {
              accountId: input.accountId,
              sourceType: "walking_reward",
              sourceRef: { startsWith: `${input.student.id}:` },
              type: "deposit",
            },
            select: { sourceRef: true },
          });
          const claimedRefs = new Set(
            previous
              .map((entry) => entry.sourceRef)
              .filter((ref): ref is string => Boolean(ref)),
          );
          const legacySourceRef = `${input.student.id}:${day}:daily-threshold`;
          if (claimedRefs.has(legacySourceRef)) {
            return {
              status: "claimed" as const,
              tier: {
                unit: input.unit,
                steps: requiredSteps,
                amount: policy.walkingRewardAmount,
                achieved: true as const,
                claimed: true as const,
                claimable: false,
              },
              rewardAmount: policy.walkingRewardAmount,
              idempotent: true,
            } satisfies ClaimDailyResult;
          }

          const rewardedDays = new Set<string>();
          for (const ref of claimedRefs) {
            const match = ref.match(/^[^:]+:(\d{4}-\d{2}-\d{2}):(?:unit:[1-4]|daily-threshold)$/);
            if (match && getKstWeekStartDay(match[1]) === range.weekStart) {
              rewardedDays.add(match[1]);
            }
          }
          if (!canRewardWalkingDay(rewardedDays, day, policy.walkingWeeklyRewardDayCap)) {
            throw new Error("walking_daily_reward_day_cap_reached");
          }

          const reward = await awardWalkingPolicyReward({
            tx,
            studentId: input.student.id,
            classroomId: input.student.classroomId,
            accountId: input.accountId,
            sourceRef,
            baseAmount: policy.walkingRewardAmount,
            note: `일간 걷기 ${requiredSteps.toLocaleString("ko-KR")}보 보상 (${input.unit}/${policy.walkingDailyUnitCap}) [${day}]`,
            policy,
          });
          if (!reward) throw new Error("walking_daily_reward_unavailable");
          return {
            status: "claimed" as const,
            tier: {
              unit: input.unit,
              steps: requiredSteps,
              amount: policy.walkingRewardAmount,
              achieved: true as const,
              claimed: true as const,
              claimable: false,
            },
            rewardAmount: reward.amount,
            idempotent: reward.idempotent,
          } satisfies ClaimDailyResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    3,
  );
}

export async function POST(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
      return jsonPrivateNoStore(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { accountId } = await ensureAccountFor(student);

    const claim = parsed.data;
    if (claim.kind === "classroom_rank") {
      const result = await claimClassroomRankReward({
        student,
        accountId,
        weekStart: claim.weekStart,
      });
      if (result.status === "not_eligible") {
        return jsonPrivateNoStore(
          { error: "classroom_rank_reward_not_eligible", rank: result.rank },
          { status: 409 },
        );
      }
      return jsonPrivateNoStore({
        classroomRankReward: {
          weekStart: result.weekStart,
          rank: result.rank,
          amount: result.amount,
          claimed: result.claimed,
        },
        rewardAmount: result.rewardAmount,
        idempotent: result.idempotent,
      });
    }
    if (claim.kind === "daily") {
      const result = await claimDailyReward({
        student,
        accountId,
        unit: claim.unit,
      });
      if (result.status === "not_achieved") {
        return jsonPrivateNoStore(
          { error: "reward_not_achieved", tier: result.tier, totalSteps: result.totalSteps, day: result.day },
          { status: 409 },
        );
      }
      return jsonPrivateNoStore({
        dailyTier: result.tier,
        rewardAmount: result.rewardAmount,
        idempotent: result.idempotent,
      });
    }

    const range = getKstRewardWeekRange();
    const sourceRef = walkingWeeklyTierSourceRef(
      student.id,
      range.weekStart,
      claim.tierKey,
    );
    const tierKey = claim.tierKey;

    const result = await retryActivityRewardTransaction<ClaimResult>(
      () =>
        db.$transaction(
          async (tx) => {
            const policy = await loadRewardPolicy(tx, student.classroomId);
            const tier = getWalkingWeeklyRewardTiers(policy).find(
              (candidate) => candidate.key === tierKey,
            );
            if (!tier) {
              throw new Error("walking_weekly_tier_missing");
            }

            const totalSteps = await readCurrentWeekSteps(
              tx,
              student.id,
              range.weekStart,
              range.weekEnd,
            );
            const achieved =
              Number.isSafeInteger(tier.steps) &&
              tier.steps > 0 &&
              totalSteps >= tier.steps;
            if (!achieved) {
              return {
                status: "not_achieved" as const,
                tier: {
                  key: tier.key,
                  steps: tier.steps,
                  amount: tier.amount,
                  achieved: false as const,
                  claimed: false,
                },
                totalSteps,
                weekStart: range.weekStart,
              } satisfies NotAchievedResult;
            }

            // The old automatic implementation used `weekly-goal` for tier 1.
            // Preserve that historical payout as already claimed without
            // issuing a second tier-source deposit.
            if (tier.key === "tier1") {
              const legacy = await tx.transaction.findFirst({
                where: {
                  sourceType: WALKING_WEEKLY_REWARD_SOURCE_TYPE,
                  sourceRef: walkingWeeklyGoalSourceRef(student.id, range.weekStart),
                  type: "deposit",
                },
                select: { id: true, accountId: true, amount: true },
              });
              if (legacy) {
                if (legacy.accountId !== accountId) {
                  throw new Error("walking_weekly_reward_account_mismatch");
                }
                return {
                  status: "claimed" as const,
                  tier: {
                    key: tier.key,
                    steps: tier.steps,
                    amount: tier.amount,
                    achieved: true as const,
                    claimed: true as const,
                  },
                  rewardAmount: legacy.amount,
                  idempotent: true,
                } satisfies ClaimTierResult;
              }
            }

            const reward = await awardWalkingPolicyReward({
              tx,
              studentId: student.id,
              classroomId: student.classroomId,
              accountId,
              sourceRef,
              sourceType: WALKING_WEEKLY_REWARD_SOURCE_TYPE,
              baseAmount: tier.amount,
              note: `주간 걷기 ${tier.steps.toLocaleString("ko-KR")}보 달성 보상 (${tier.key}) [${range.weekStart}]`,
              policy,
            });
            if (!reward) {
              throw new Error("walking_weekly_reward_unavailable");
            }
            return {
              status: "claimed" as const,
              tier: {
                key: tier.key,
                steps: tier.steps,
                amount: tier.amount,
                achieved: true as const,
                claimed: true as const,
              },
              rewardAmount: reward.amount,
              idempotent: reward.idempotent,
            } satisfies ClaimTierResult;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      3,
      async (error) => {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          return false;
        }
        const target = (error.meta as { target?: unknown } | undefined)?.target;
        if (
          (Array.isArray(target) &&
            target.includes("sourceType") &&
            target.includes("sourceRef")) ||
          String(target ?? "").includes("sourceType")
        ) {
          return true;
        }
        const raced = await db.transaction.findFirst({
          where: {
            sourceType: WALKING_WEEKLY_REWARD_SOURCE_TYPE,
            sourceRef,
            type: "deposit",
          },
          select: { id: true },
        });
        return raced !== null;
      },
    );

    if (result.status === "not_achieved") {
      return jsonPrivateNoStore(
        {
          error: "reward_not_achieved",
          tier: result.tier,
          totalSteps: result.totalSteps,
          weekStart: result.weekStart,
        },
        { status: 409 },
      );
    }
    return jsonPrivateNoStore({
      tier: result.tier,
      rewardAmount: result.rewardAmount,
      idempotent: result.idempotent,
    });
  } catch (error) {
    console.error("[POST /api/student/walking/rewards/claim]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
