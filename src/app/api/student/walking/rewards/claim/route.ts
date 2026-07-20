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
  getKstRewardWeekRange,
  getWalkingWeeklyRewardTiers,
  walkingWeeklyGoalSourceRef,
  walkingWeeklyTierSourceRef,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
} from "@/lib/reward-policy";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const claimSchema = z.object({
  tierKey: z.enum(["tier1", "tier2", "tier3"]),
});

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

    const range = getKstRewardWeekRange();
    const sourceRef = walkingWeeklyTierSourceRef(
      student.id,
      range.weekStart,
      parsed.data.tierKey,
    );
    const { accountId } = await ensureAccountFor(student);

    const result = await retryActivityRewardTransaction<ClaimResult>(
      () =>
        db.$transaction(
          async (tx) => {
            const policy = await loadRewardPolicy(tx, student.classroomId);
            const tier = getWalkingWeeklyRewardTiers(policy).find(
              (candidate) => candidate.key === parsed.data.tierKey,
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
