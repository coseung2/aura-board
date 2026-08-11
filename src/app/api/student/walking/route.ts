import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import {
  awardActivityReward,
  retryActivityRewardTransaction,
} from "@/lib/creatures/activity-rewards";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { readWalkingTitles } from "@/lib/titles";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  addWalkingDays,
  getWalkingDayKey,
  getWalkingDayRange,
  isValidWalkingDay,
} from "@/lib/walking";
import {
  canRewardWalkingDay,
  getKstRewardMonthRange,
  getKstRewardMonthRangeForDay,
  getKstRewardWeekRange,
  getKstClassroomWalkingRankPeriods,
  getKstClassroomWalkingRankRewardPeriods,
  getWalkingWeeklyRewardTiers,
  getKstWeekStartDay,
  walkingRewardUnits,
  walkingMonthlyAttendanceRewardAmount,
  walkingMonthlyAttendanceSourceRef,
  walkingMonthlyCookieRewardSourceRef,
  walkingClassroomRankRewardSourceRef,
  isWalkingMonthlyCookieRewardOrdinal,
  WALKING_CLASSROOM_RANK_REWARDS,
  WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
  walkingUnitSourceRef,
  walkingWeeklyTierSourceRef,
  walkingWeeklyGoalSourceRef,
  WALKING_MONTHLY_ATTENDANCE_ITEM_ORDINAL,
  WALKING_MONTHLY_ATTENDANCE_ORDINALS,
  WALKING_MONTHLY_COOKIE_REWARD_SOURCE_TYPE,
  WALKING_MONTHLY_REWARD_SOURCE_TYPE,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
} from "@/lib/reward-policy";
import {
  awardWalkingPolicyReward,
  loadRewardPolicy,
} from "@/lib/reward-service";
import { awardWalkingAttendanceCookie } from "@/lib/walking-attendance-rewards";
import { getEquippedSlimeFloor } from "@/lib/pets/catalog";
import type { SlimeFloor } from "@/lib/pets/types";
import {
  getStudentMonthlyAttendance,
  recordStudentAttendanceVisit,
  type MonthlyAttendanceSummary,
} from "@/lib/student-attendance";
import {
  WalkingAttendanceEligibilityError,
  attendanceForWalkingClient,
  handleWalkingGet,
  readRows,
  toDayKey,
} from "./walking-read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const walkingRowSchema = z.object({
  day: z.string().refine(isValidWalkingDay, { message: "invalid_day" }),
  steps: z.number().int().min(0).max(200_000),
  distanceMeters: z.number().finite().min(0).max(300_000),
});

const walkingDaySchema = z.string().refine(isValidWalkingDay, {
  message: "invalid_day",
});

const syncSchema = z.object({
  // Keep the original sync payload unchanged while allowing attendance-only
  // requests from the calendar.  A request must contain at least one kind of
  // work; this keeps `{}` and accidental empty syncs invalid.
  rows: z.array(walkingRowSchema).min(1).max(31).optional(),
  attendanceDays: z.array(walkingDaySchema).min(1).max(31).optional(),
  // Accepting a single-day alias costs nothing and makes a calendar tap easy
  // for clients that do not need to allocate an array.
  attendanceDay: walkingDaySchema.optional(),
  attendanceVisit: z.literal(true).optional(),
}).superRefine((value, context) => {
  if (
    !value.rows?.length &&
    !value.attendanceDays?.length &&
    !value.attendanceDay &&
    !value.attendanceVisit
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: "at_least_one_row_or_attendance_day",
    });
  }
});

export async function GET(request: NextRequest) {
  return handleWalkingGet(request);
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

    if (parsed.data.attendanceVisit) {
      await recordStudentAttendanceVisit(student);
    }

    const { minDay, maxDay } = getWalkingDayRange();
    const uniqueRows = new Map(
      (parsed.data.rows ?? []).map((row) => [row.day, row]),
    );
    const rows = [...uniqueRows.values()];
    const requestedAttendanceDays = [
      ...(parsed.data.attendanceDays ?? []),
      ...(parsed.data.attendanceDay ? [parsed.data.attendanceDay] : []),
    ];
    const attendanceDays = [...new Set(requestedAttendanceDays)].sort((a, b) =>
      a.localeCompare(b),
    );
    // App visits now write to StudentAttendance. Keep this endpoint's legacy
    // field in the payload only so older clients receive a successful reply.
    const attendanceVisitDay = null;

    if (
      rows.some((row) => row.day < minDay || row.day > maxDay) ||
      attendanceDays.some((day) => day < minDay || day > maxDay)
    ) {
      return jsonPrivateNoStore({ error: "day_out_of_range" }, { status: 400 });
    }

    const { accountId } = await ensureAccountFor(student);
    const sortedRows = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const touchedDays = [
      ...new Set([
        ...sortedRows.map((row) => row.day),
        ...attendanceDays,
        ...(attendanceVisitDay ? [attendanceVisitDay] : []),
      ]),
    ];
    const monthRanges = [
      ...new Map(
        touchedDays.map((day) => {
          const monthRange = getKstRewardMonthRangeForDay(day);
          return [monthRange.month, monthRange] as const;
        }),
      ).values(),
    ].sort((a, b) => a.month.localeCompare(b.month));
    const monthlySourceRefs = monthRanges.flatMap((monthRange) =>
      Array.from(
        { length: WALKING_MONTHLY_ATTENDANCE_ORDINALS },
        (_, index) => index + 1,
      )
        .filter((ordinal) => ordinal !== WALKING_MONTHLY_ATTENDANCE_ITEM_ORDINAL)
        .map((ordinal) =>
          walkingMonthlyAttendanceSourceRef(student.id, monthRange.month, ordinal),
        ),
    );
    const monthlyCookieSourceRefs = monthRanges.flatMap((monthRange) =>
      Array.from(
        { length: WALKING_MONTHLY_ATTENDANCE_ORDINALS },
        (_, index) => index + 1,
      )
        .filter(isWalkingMonthlyCookieRewardOrdinal)
        .map((ordinal) =>
          walkingMonthlyCookieRewardSourceRef(student.id, monthRange.month, ordinal),
        ),
    );
    const sourceRefs = [
      ...monthlySourceRefs,
      ...monthlyCookieSourceRefs,
    ];
    await retryActivityRewardTransaction(
      () =>
        db.$transaction(
          async (tx) => {
            for (const row of sortedRows) {
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

            if (attendanceDays.length > 0) {
              const requestedDateSql = Prisma.join(
                attendanceDays.map((day) => Prisma.sql`${day}::date`),
                ", ",
              );
              const syncedAttendanceRows = await tx.$queryRaw<
                Array<{
                  day: Date | string;
                  attendanceVisitedAt: Date | string | null;
                  attendanceOrdinal: number | null;
                  attendanceCompletedAt: Date | string | null;
                }>
              >(Prisma.sql`
                SELECT
                  "day",
                  "attendanceVisitedAt",
                  "attendanceOrdinal",
                  "attendanceCompletedAt"
                FROM "StudentWalkingDailyStat"
                WHERE "studentId" = ${student.id}
                  AND "day" IN (${requestedDateSql})
                FOR UPDATE
              `);
              const syncedAttendanceDays = new Set(
                syncedAttendanceRows
                  .filter(
                    (row) =>
                      row.attendanceVisitedAt != null &&
                      row.attendanceOrdinal != null,
                  )
                  .map((row) => toDayKey(row.day)),
              );
              const missingAttendanceDays = attendanceDays.filter(
                (day) => !syncedAttendanceDays.has(day),
              );
              if (missingAttendanceDays.length > 0) {
                throw new WalkingAttendanceEligibilityError(missingAttendanceDays);
              }

              // Only the first transition creates a completion. Replays are
              // deliberately harmless and still return the normal snapshot.
              await tx.$executeRaw(Prisma.sql`
                UPDATE "StudentWalkingDailyStat"
                SET "attendanceCompletedAt" = CURRENT_TIMESTAMP,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "studentId" = ${student.id}
                  AND "day" IN (${requestedDateSql})
                  AND "attendanceCompletedAt" IS NULL
              `);
            }

            const previous = await tx.transaction.findMany({
              where: {
                accountId,
                sourceType: {
                  in: [
                    WALKING_WEEKLY_REWARD_SOURCE_TYPE,
                    WALKING_MONTHLY_REWARD_SOURCE_TYPE,
                    WALKING_MONTHLY_COOKIE_REWARD_SOURCE_TYPE,
                  ],
                },
                sourceRef: { startsWith: `${student.id}:` },
                type: { in: ["deposit", "item_grant"] },
              },
              select: { sourceRef: true },
            });
            const rewardedRefs = new Set(
              previous.map((entry) => entry.sourceRef).filter((ref): ref is string => Boolean(ref)),
            );

            // Each visit receives a stable ordinal when it is first recorded.
            // Claims may happen later or out of order without renumbering.
            for (const monthRange of monthRanges) {
              const monthRows = await tx.$queryRaw<
                Array<{
                  day: Date | string;
                  attendanceOrdinal: number;
                  attendanceCompletedAt: Date | string | null;
                }>
              >(Prisma.sql`
                SELECT "day", "attendanceOrdinal", "attendanceCompletedAt"
                FROM "StudentWalkingDailyStat"
                WHERE "studentId" = ${student.id}
                  AND "attendanceMonth" = ${monthRange.month}
                  AND "attendanceOrdinal" IS NOT NULL
                  AND "attendanceCompletedAt" IS NOT NULL
                ORDER BY "attendanceOrdinal" ASC
              `);
              for (const attendanceRow of monthRows) {
                const ordinal = attendanceRow.attendanceOrdinal;
                if (
                  ordinal < 1 ||
                  ordinal > WALKING_MONTHLY_ATTENDANCE_ORDINALS
                ) continue;
                if (ordinal === WALKING_MONTHLY_ATTENDANCE_ITEM_ORDINAL) continue;
                const sourceRef = walkingMonthlyAttendanceSourceRef(
                  student.id,
                  monthRange.month,
                  ordinal,
                );
                const day = toDayKey(attendanceRow.day);
                if (!rewardedRefs.has(sourceRef)) {
                  const amount = walkingMonthlyAttendanceRewardAmount(ordinal);
                  await awardActivityReward({
                    tx,
                    studentId: student.id,
                    classroomId: student.classroomId,
                    accountId,
                    sourceType: WALKING_MONTHLY_REWARD_SOURCE_TYPE,
                    sourceRef,
                    amount,
                    note: `월간 걷기 출석 ${ordinal}일차 보상 [${monthRange.month}:${day}]`,
                  });
                  rewardedRefs.add(sourceRef);
                }

                if (isWalkingMonthlyCookieRewardOrdinal(ordinal)) {
                  const cookieSourceRef = walkingMonthlyCookieRewardSourceRef(
                    student.id,
                    monthRange.month,
                    ordinal,
                  );
                  if (!rewardedRefs.has(cookieSourceRef)) {
                    await awardWalkingAttendanceCookie({
                      tx,
                      studentId: student.id,
                      classroomId: student.classroomId,
                      accountId,
                      month: monthRange.month,
                      ordinal,
                      attendedDay: day,
                    });
                    rewardedRefs.add(cookieSourceRef);
                  }
                }
              }
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
            sourceType: {
              in: [
                "walking_reward",
                WALKING_WEEKLY_REWARD_SOURCE_TYPE,
                WALKING_MONTHLY_COOKIE_REWARD_SOURCE_TYPE,
              ],
            },
            sourceRef: { in: sourceRefs },
            type: { in: ["deposit", "item_grant"] },
          },
          select: { id: true },
        });
        return raced !== null;
      },
    );

    const latestDay = getWalkingDayKey();
    const responseRows = await readRows(student.id, {
      startDay: addWalkingDays(latestDay, -30),
      endDayExclusive: addWalkingDays(latestDay, 1),
    });
    const responseMonthRange = getKstRewardMonthRange();
    const syncedDays = responseRows
      .filter((row) => row.syncedAt != null)
      .map((row) => row.day);
    const completedAttendanceDays = responseRows
      .filter((row) => row.attendanceCompletedAt != null)
      .map((row) => row.day);
    return jsonPrivateNoStore({
      rows: responseRows,
      syncedDays,
      completedAttendanceDays,
      monthlyAttendanceReward: attendanceForWalkingClient(
        await getStudentMonthlyAttendance(student.id, responseMonthRange),
      ),
    });
  } catch (error) {
    if (error instanceof WalkingAttendanceEligibilityError) {
      return jsonPrivateNoStore(
        { error: error.message, days: error.days },
        { status: 400 },
      );
    }
    console.error("[POST /api/student/walking]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
