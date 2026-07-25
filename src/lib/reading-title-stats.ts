import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "./db";
import { readingTitleProgress, type ReadingTitleStats } from "./reading-titles";

const EMPTY_STATS: ReadingTitleStats = {
  totalLogs: 0,
  maxStreakDays: 0,
  maxReflectionLength: 0,
};

/**
 * Reading title stats for one student. Streak days are grouped in KST so a log
 * written late at night counts toward the day the student saw in the app.
 */
export async function readReadingTitleStats(
  studentId: string,
): Promise<ReadingTitleStats> {
  if (!db.readingLog) return EMPTY_STATS;

  const [stats] = await db.$queryRaw<ReadingTitleStats[]>(Prisma.sql`
    WITH logs AS (
      SELECT
        ("createdAt" AT TIME ZONE 'Asia/Seoul')::date AS "day",
        CHAR_LENGTH("reflection") AS "reflectionLength"
      FROM "ReadingLog"
      WHERE "studentId" = ${studentId}
    ), totals AS (
      SELECT
        COUNT(*)::bigint AS "totalLogs",
        COALESCE(MAX("reflectionLength"), 0)::bigint AS "maxReflectionLength"
      FROM logs
    ), days AS (
      SELECT DISTINCT "day" FROM logs
    ), grouped AS (
      SELECT
        "day",
        "day" - (ROW_NUMBER() OVER (ORDER BY "day"))::int AS "streakGroup"
      FROM days
    ), streaks AS (
      SELECT COUNT(*)::bigint AS "streakDays"
      FROM grouped
      GROUP BY "streakGroup"
    )
    SELECT
      totals."totalLogs",
      totals."maxReflectionLength",
      COALESCE((SELECT MAX("streakDays") FROM streaks), 0)::bigint AS "maxStreakDays"
    FROM totals
  `);

  return stats ?? EMPTY_STATS;
}

export async function readReadingTitleProgress(studentId: string) {
  return readingTitleProgress(await readReadingTitleStats(studentId));
}
