import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "./db";
import { walkingTitleProgress, type WalkingTitleStats } from "./walking-titles";

const EMPTY_STATS: WalkingTitleStats = {
  maxDailySteps: 0,
  maxWeeklySteps: 0,
  maxMonthlySteps: 0,
};

/** Best daily, weekly, and monthly step totals used to resolve walking titles. */
export async function readWalkingTitleStats(
  studentId: string,
): Promise<WalkingTitleStats> {
  const [stats] = await db.$queryRaw<WalkingTitleStats[]>(Prisma.sql`
    WITH daily AS (
      SELECT MAX("steps")::bigint AS "maxDailySteps"
      FROM "StudentWalkingDailyStat"
      WHERE "studentId" = ${studentId}
    ), weekly AS (
      SELECT MAX("weeklySteps")::bigint AS "maxWeeklySteps"
      FROM (
        SELECT DATE_TRUNC('week', "day") AS "weekStart", SUM("steps")::bigint AS "weeklySteps"
        FROM "StudentWalkingDailyStat"
        WHERE "studentId" = ${studentId}
        GROUP BY DATE_TRUNC('week', "day")
      ) totals
    ), monthly AS (
      SELECT MAX("monthlySteps")::bigint AS "maxMonthlySteps"
      FROM (
        SELECT DATE_TRUNC('month', "day") AS "monthStart", SUM("steps")::bigint AS "monthlySteps"
        FROM "StudentWalkingDailyStat"
        WHERE "studentId" = ${studentId}
        GROUP BY DATE_TRUNC('month', "day")
      ) totals
    )
    SELECT
      COALESCE(daily."maxDailySteps", 0)::bigint AS "maxDailySteps",
      COALESCE(weekly."maxWeeklySteps", 0)::bigint AS "maxWeeklySteps",
      COALESCE(monthly."maxMonthlySteps", 0)::bigint AS "maxMonthlySteps"
    FROM daily CROSS JOIN weekly CROSS JOIN monthly
  `);

  return stats ?? EMPTY_STATS;
}

export async function readWalkingTitleProgress(studentId: string) {
  return walkingTitleProgress(await readWalkingTitleStats(studentId));
}
