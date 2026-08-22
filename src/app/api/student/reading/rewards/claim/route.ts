import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { ensureAccountFor } from "@/lib/bank";
import { retryActivityRewardTransaction } from "@/lib/creatures/activity-rewards";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  buildReadingWeeklyMissionReward,
  parseReadingMissionStepSourceRef,
  readingMissionStepSourceRef,
  READING_MISSION_KEYS,
  READING_MISSION_STEP_REWARD_AMOUNT,
  type ReadingMissionKey,
  type ReadingMissionStep,
  type ReadingMissionStepClaim,
  type ReadingWeeklyMissionReward,
} from "@/lib/reading-missions";
import {
  getKstClassroomWalkingRankPeriods,
  getKstClassroomWalkingRankRewardPeriods,
  readingClassroomRankRewardSourceRef,
  READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
  READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
  readingWeeklyMissionSourceRef,
  WALKING_CLASSROOM_RANK_REWARDS,
} from "@/lib/reward-policy";
import {
  awardReadingPolicyReward,
  awardReadingWeeklyMissionReward,
  loadRewardPolicy,
} from "@/lib/reward-service";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const claimSchema = z.union([
  z.object({
    missionKey: z.enum(["weekly_books", "consecutive_days", "reflection_chars"]),
    unit: z.number().int().min(1).max(10),
  }),
  z.object({
    kind: z.literal("classroom_rank"),
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);

type ClaimResult =
  | {
      status: "claimed";
      weeklyMissionReward: ReadingWeeklyMissionReward;
      missionKey: ReadingMissionKey;
      unit: number;
      step: ReadingMissionStep;
      rewardAmount: number;
      idempotent: boolean;
    }
  | {
      status: "not_achieved";
      weeklyMissionReward: ReadingWeeklyMissionReward;
      missionKey: ReadingMissionKey;
      unit: number;
      step: ReadingMissionStep;
    }
  | {
      status: "invalid_unit";
      weeklyMissionReward: ReadingWeeklyMissionReward;
      missionKey: ReadingMissionKey;
      unit: number;
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

async function readCurrentClassroomRank(
  tx: Prisma.TransactionClient,
  classroomId: string,
  studentId: string,
  weekStartDay: string,
  weekEndDay: string,
): Promise<number | null> {
  const weekStart = new Date(`${weekStartDay}T00:00:00+09:00`);
  const weekEnd = new Date(`${weekEndDay}T00:00:00+09:00`);
  const rows = await tx.$queryRaw<Array<{ rank: bigint | number }>>(Prisma.sql`
    WITH ranked AS (
      SELECT
        student."id" AS "studentId",
        ROW_NUMBER() OVER (
          ORDER BY
            COUNT(log."id") DESC,
            student."number" ASC NULLS LAST,
            student."name" ASC
        ) AS "rank"
      FROM "Student" student
      LEFT JOIN "ReadingLog" log
        ON log."studentId" = student."id"
        AND log."classroomId" = ${classroomId}
        AND log."createdAt" >= ${weekStart}
        AND log."createdAt" < ${weekEnd}
        AND log."missionCounted" = true
      WHERE student."classroomId" = ${classroomId}
      GROUP BY student."id", student."number", student."name"
      HAVING COUNT(log."id") > 0
    )
    SELECT "rank"
    FROM ranked
    WHERE "studentId" = ${studentId}
  `);
  const rank = Number(rows[0]?.rank);
  return Number.isSafeInteger(rank) && rank > 0 ? rank : null;
}

function getKstClassroomRankRewardPeriod(weekStart: string) {
  return getKstClassroomWalkingRankRewardPeriods().find(
    (period) => period.weekStart === weekStart,
  ) ?? null;
}

async function claimClassroomRankReward(input: {
  student: { id: string; classroomId: string };
  accountId: string;
  weekStart: string;
}): Promise<ClassroomRankRewardResult | ClassroomRankNotEligibleResult> {
  const range = getKstClassroomRankRewardPeriod(input.weekStart);
  if (!range) return { status: "not_eligible", rank: null };
  const sourceRef = readingClassroomRankRewardSourceRef(
    input.student.id,
    range.weekStart,
  );

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
            return { status: "not_eligible" as const, rank };
          }
          const policy = await loadRewardPolicy(tx, input.student.classroomId);
          const reward = await awardReadingPolicyReward({
            tx,
            studentId: input.student.id,
            classroomId: input.student.classroomId,
            accountId: input.accountId,
            sourceType: READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
            sourceRef,
            baseAmount: amount,
            note: `독서 반 랭킹 ${rank}위 보상 [${range.weekStart}]`,
            policy,
          });
          if (!reward) throw new Error("reading_classroom_rank_reward_unavailable");
          return {
            status: "claimed" as const,
            weekStart: range.weekStart,
            rank,
            amount,
            claimed: true as const,
            rewardAmount: reward.amount,
            idempotent: reward.idempotent,
          };
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
          sourceType: READING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
          sourceRef,
          type: "deposit",
        },
        select: { id: true },
      });
      return raced !== null;
    },
  );
}

export async function POST(req: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
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
    if ("kind" in parsed.data) {
      const result = await claimClassroomRankReward({
        student,
        accountId,
        weekStart: parsed.data.weekStart,
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

    const missionKey = parsed.data.missionKey as ReadingMissionKey;
    const unit = parsed.data.unit;

    const periods = getKstClassroomWalkingRankPeriods();
    const weekStart = periods.active.weekStart;
    const weekEnd = periods.active.weekEnd;
    const legacySourceRef = readingWeeklyMissionSourceRef(student.id, weekStart);
    const sourceRef = readingMissionStepSourceRef(
      student.id,
      weekStart,
      missionKey,
      unit,
    );

    const result = await retryActivityRewardTransaction<ClaimResult>(
      () =>
        db.$transaction(
          async (tx) => {
            const [logs, deposits] = await Promise.all([
              tx.readingLog.findMany({
                where: {
                  studentId: student.id,
                  classroomId: student.classroomId,
                  createdAt: {
                    gte: new Date(`${weekStart}T00:00:00+09:00`),
                    lt: new Date(`${weekEnd}T00:00:00+09:00`),
                  },
                },
                select: { createdAt: true, reflection: true },
              }),
              tx.transaction.findMany({
                where: {
                  sourceType: READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
                  OR: [
                    { sourceRef: legacySourceRef },
                    { sourceRef: { startsWith: `${legacySourceRef}:` } },
                  ],
                  type: "deposit",
                },
                select: { sourceRef: true, accountId: true },
              }),
            ]);

            const claimedKeys = new Set<ReadingMissionKey>();
            const claimedSteps: ReadingMissionStepClaim[] = [];
            let legacyAllClaimed = false;
            for (const deposit of deposits) {
              if (!deposit.sourceRef) continue;
              if (deposit.accountId !== accountId) {
                throw new Error("reading_weekly_mission_reward_account_mismatch");
              }
              if (deposit.sourceRef === legacySourceRef) {
                legacyAllClaimed = true;
                continue;
              }
              const parsedStep = parseReadingMissionStepSourceRef(
                deposit.sourceRef,
                student.id,
                weekStart,
              );
              if (parsedStep) {
                claimedSteps.push(parsedStep);
                continue;
              }
              for (const key of READING_MISSION_KEYS) {
                if (deposit.sourceRef === readingWeeklyMissionSourceRef(student.id, weekStart, key)) {
                  claimedKeys.add(key);
                }
              }
            }

            const rewardInput = {
              studentId: student.id,
              weekStart,
              weekEnd,
              logs,
              claimedKeys: [...claimedKeys],
              claimedSteps,
              legacyAllClaimed,
            };
            const packageReward = buildReadingWeeklyMissionReward(rewardInput);
            const mission = packageReward.missions.find((item) => item.key === missionKey);
            if (!mission) throw new Error("reading_mission_missing");
            const step = mission.steps?.find((item) => item.unit === unit);
            if (!step) {
              return {
                status: "invalid_unit" as const,
                weeklyMissionReward: packageReward,
                missionKey,
                unit,
              };
            }
            if (!step.achieved && !step.claimed) {
              return {
                status: "not_achieved" as const,
                weeklyMissionReward: packageReward,
                missionKey,
                unit,
                step,
              };
            }

            // Legacy all-mission/per-mission deposits already cover every step.
            // Report a harmless replay without creating a new unit deposit.
            if (step.claimed && !claimedSteps.some(
              (claim) => claim.missionKey === missionKey && claim.unit === unit,
            )) {
              return {
                status: "claimed" as const,
                weeklyMissionReward: packageReward,
                missionKey,
                unit,
                step,
                rewardAmount: step.amount,
                idempotent: true,
              };
            }

            const policy = await loadRewardPolicy(tx, student.classroomId);
            const reward = await awardReadingWeeklyMissionReward({
              tx,
              studentId: student.id,
              classroomId: student.classroomId,
              accountId,
              sourceRef,
              baseAmount: READING_MISSION_STEP_REWARD_AMOUNT,
              note: `독서 주간 미션 보상 (${mission.title} ${step.target}${mission.unit}) [${weekStart}]`,
              policy,
            });
            if (!reward) {
              throw new Error("reading_weekly_mission_reward_unavailable");
            }

            if (!claimedSteps.some(
              (claim) => claim.missionKey === missionKey && claim.unit === unit,
            )) {
              claimedSteps.push({ missionKey, unit });
            }
            const nextReward = buildReadingWeeklyMissionReward({
              ...rewardInput,
              claimedSteps,
            });
            const nextStep = nextReward.missions
              .find((item) => item.key === missionKey)
              ?.steps?.find((item) => item.unit === unit);
            if (!nextStep) throw new Error("reading_mission_step_missing");

            return {
              status: "claimed" as const,
              weeklyMissionReward: nextReward,
              missionKey,
              unit,
              step: nextStep,
              rewardAmount: reward.amount,
              idempotent: reward.idempotent,
            };
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
            sourceType: READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
            sourceRef,
            type: "deposit",
          },
          select: { id: true },
        });
        return raced !== null;
      },
    );

    if (result.status === "invalid_unit") {
      return jsonPrivateNoStore(
        {
          error: "invalid_mission_unit",
          weeklyMissionReward: result.weeklyMissionReward,
          missionKey: result.missionKey,
          unit: result.unit,
        },
        { status: 400 },
      );
    }
    if (result.status === "not_achieved") {
      return jsonPrivateNoStore(
        {
          error: "reward_not_achieved",
          weeklyMissionReward: result.weeklyMissionReward,
          missionKey: result.missionKey,
          unit: result.unit,
          step: result.step,
        },
        { status: 409 },
      );
    }

    return jsonPrivateNoStore({
      weeklyMissionReward: result.weeklyMissionReward,
      missionKey: result.missionKey,
      unit: result.unit,
      step: result.step,
      rewardAmount: result.rewardAmount,
      idempotent: result.idempotent,
    });
  } catch (error) {
    console.error("[POST /api/student/reading/rewards/claim]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
