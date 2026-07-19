import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import {
  retryActivityRewardTransaction,
} from "@/lib/creatures/activity-rewards";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";
import { getWalkingDayRange, isValidWalkingDay } from "@/lib/walking";
import {
  canRewardWalkingDay,
  getKstWeekStartDay,
  walkingRewardUnits,
  walkingUnitSourceRef,
  walkingWeeklyGoalSourceRef,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
} from "@/lib/reward-policy";
import {
  awardWalkingPolicyReward,
  loadRewardPolicy,
} from "@/lib/reward-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const walkingRowSchema = z.object({
  day: z.string().refine(isValidWalkingDay, { message: "invalid_day" }),
  steps: z.number().int().min(0).max(200_000),
  distanceMeters: z.number().finite().min(0).max(300_000),
});

const syncSchema = z.object({
  rows: z.array(walkingRowSchema).min(1).max(31),
});

type RawWalkingRow = {
  day: Date | string;
  steps: number;
  distanceMeters: number;
  syncedAt: Date | string;
};

function toDayKey(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseDays(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days") ?? "7");
  if (!Number.isFinite(raw)) return 7;
  return Math.min(31, Math.max(1, Math.round(raw)));
}

async function readRows(studentId: string, days: number) {
  const rows = await db.$queryRaw<RawWalkingRow[]>(Prisma.sql`
    SELECT
      "day",
      "steps",
      "distanceMeters",
      "syncedAt"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - (${days - 1})::int)
      AND "day" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
    ORDER BY "day" ASC
  `);

  return rows.map((row) => ({
    day: toDayKey(row.day),
    steps: Number(row.steps) || 0,
    distanceMeters: Number(row.distanceMeters) || 0,
    syncedAt:
      row.syncedAt instanceof Date
        ? row.syncedAt.toISOString()
        : new Date(row.syncedAt).toISOString(),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    }

    const days = parseDays(request);
    return jsonPrivateNoStore({ rows: await readRows(student.id, days) });
  } catch (error) {
    console.error("[GET /api/student/walking]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
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

    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return jsonPrivateNoStore(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { minDay, maxDay } = getWalkingDayRange();
    const uniqueRows = new Map(parsed.data.rows.map((row) => [row.day, row]));
    const rows = [...uniqueRows.values()];

    if (rows.some((row) => row.day < minDay || row.day > maxDay)) {
      return jsonPrivateNoStore({ error: "day_out_of_range" }, { status: 400 });
    }

    const { accountId } = await ensureAccountFor(student);
    const weekStarts = [...new Set(rows.map((row) => getKstWeekStartDay(row.day)))];
    const sourceRefs = rows.flatMap((row) => [
      walkingUnitSourceRef(student.id, row.day, 1),
      walkingUnitSourceRef(student.id, row.day, 2),
      walkingWeeklyGoalSourceRef(student.id, getKstWeekStartDay(row.day)),
    ]);
    await retryActivityRewardTransaction(
      () =>
        db.$transaction(
          async (tx) => {
            const policy = await loadRewardPolicy(tx, student.classroomId);

            for (const row of rows.sort((a, b) => a.day.localeCompare(b.day))) {
              await tx.$executeRaw(Prisma.sql`
                INSERT INTO "StudentWalkingDailyStat" (
                  "id",
                  "studentId",
                  "day",
                  "steps",
                  "distanceMeters",
                  "source",
                  "syncedAt",
                  "createdAt",
                  "updatedAt"
                ) VALUES (
                  ${randomUUID()},
                  ${student.id},
                  ${row.day}::date,
                  ${row.steps},
                  ${Math.round(row.distanceMeters * 100) / 100},
                  'health_connect',
                  CURRENT_TIMESTAMP,
                  CURRENT_TIMESTAMP,
                  CURRENT_TIMESTAMP
                )
                ON CONFLICT ("studentId", "day") DO UPDATE SET
                  "steps" = EXCLUDED."steps",
                  "distanceMeters" = EXCLUDED."distanceMeters",
                  "source" = EXCLUDED."source",
                  "syncedAt" = CURRENT_TIMESTAMP,
                  "updatedAt" = CURRENT_TIMESTAMP
              `);
            }

            const previous = await tx.transaction.findMany({
              where: {
                accountId,
                sourceType: "walking_reward",
                sourceRef: { startsWith: `${student.id}:` },
                type: "deposit",
              },
              select: { sourceRef: true },
            });
            const rewardedRefs = new Set(
              previous.map((entry) => entry.sourceRef).filter((ref): ref is string => Boolean(ref)),
            );

            for (const row of rows) {
              const units = walkingRewardUnits(
                row.steps,
                policy.walkingRewardStepThreshold,
                policy.walkingDailyUnitCap,
              );
              if (units === 0) continue;
              const weekStart = getKstWeekStartDay(row.day);
              const rewardedDays = new Set<string>();
              for (const ref of rewardedRefs) {
                const match = ref.match(
                  /^[^:]+:(\d{4}-\d{2}-\d{2}):(?:unit:[12]|daily-threshold)$/,
                );
                if (match && getKstWeekStartDay(match[1]) === weekStart) rewardedDays.add(match[1]);
              }
              // The former one-shot 5,000-step payout was 20 won, equivalent
              // to both new 10-won units. Preserve it without a migration-time
              // double payment.
              if (rewardedRefs.has(`${student.id}:${row.day}:daily-threshold`)) continue;
              if (!canRewardWalkingDay(rewardedDays, row.day, policy.walkingWeeklyRewardDayCap)) continue;
              for (let unit = 1; unit <= units; unit += 1) {
                const sourceRef = walkingUnitSourceRef(student.id, row.day, unit);
                await awardWalkingPolicyReward({
                  tx,
                  studentId: student.id,
                  classroomId: student.classroomId,
                  accountId,
                  sourceRef,
                  baseAmount: policy.walkingRewardAmount,
                  note: `걷기 ${policy.walkingRewardStepThreshold.toLocaleString("ko-KR")}보 보상 (${unit}/${policy.walkingDailyUnitCap}) [${row.day}]`,
                  policy,
                });
                rewardedRefs.add(sourceRef);
              }
            }

            for (const weekStart of weekStarts) {
              const totals = await tx.$queryRaw<Array<{ steps: bigint | number | null }>>(Prisma.sql`
                SELECT SUM("steps") AS "steps"
                FROM "StudentWalkingDailyStat"
                WHERE "studentId" = ${student.id}
                  AND "day" >= ${weekStart}::date
                  AND "day" < (${weekStart}::date + 7)
              `);
              const steps = Number(totals[0]?.steps ?? 0);
              if (steps < policy.walkingWeeklyGoalSteps) continue;
              await awardWalkingPolicyReward({
                tx,
                studentId: student.id,
                classroomId: student.classroomId,
                accountId,
                sourceRef: walkingWeeklyGoalSourceRef(student.id, weekStart),
                sourceType: WALKING_WEEKLY_REWARD_SOURCE_TYPE,
                baseAmount: policy.walkingWeeklyGoalAmount,
                note: `주간 걷기 ${policy.walkingWeeklyGoalSteps.toLocaleString("ko-KR")}보 달성 보상 [${weekStart}]`,
                policy,
              });
            }
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

        // Retry the entire batch only for this reward's source uniqueness
        // conflict. The source row may still be invisible while the winner
        // commits, so inspect the unique target as well as committed rows.
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
            accountId,
            sourceType: { in: ["walking_reward", WALKING_WEEKLY_REWARD_SOURCE_TYPE] },
            sourceRef: { in: sourceRefs },
            type: "deposit",
          },
          select: { id: true },
        });
        return raced !== null;
      },
    );

    return jsonPrivateNoStore({ rows: await readRows(student.id, 31) });
  } catch (error) {
    console.error("[POST /api/student/walking]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
