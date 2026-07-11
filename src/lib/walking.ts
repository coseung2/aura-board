import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

export type WalkingDay = {
  day: string;
  steps: number;
  distanceMeters: number;
  syncedAt: string | null;
};

type RawWalkingDay = {
  day: Date | string;
  steps: number;
  distanceMeters: number;
  syncedAt: Date | string | null;
};

type RawClassroomWalkingRow = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  todaySteps: number;
  sevenDaySteps: number;
  sevenDayDistanceMeters: number;
  lastSyncedAt: Date | string | null;
};

function normalizeDay(value: Date | string) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function normalizeDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getStudentWalkingDays(studentId: string, days = 7) {
  const safeDays = Math.min(31, Math.max(1, Math.round(days)));
  const rows = await db.$queryRaw<RawWalkingDay[]>(Prisma.sql`
    SELECT "day", "steps", "distanceMeters", "syncedAt"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= CURRENT_DATE - (${safeDays - 1} * INTERVAL '1 day')
      AND "day" <= CURRENT_DATE
    ORDER BY "day" ASC
  `);

  return rows.map((row): WalkingDay => ({
    day: normalizeDay(row.day),
    steps: Number(row.steps) || 0,
    distanceMeters: Number(row.distanceMeters) || 0,
    syncedAt: normalizeDate(row.syncedAt),
  }));
}

export async function getClassroomWalkingSummary(classroomId: string) {
  const rows = await db.$queryRaw<RawClassroomWalkingRow[]>(Prisma.sql`
    SELECT
      s."id" AS "studentId",
      s."number" AS "studentNumber",
      s."name" AS "studentName",
      COALESCE(SUM(CASE WHEN w."day" = CURRENT_DATE THEN w."steps" ELSE 0 END), 0)::int AS "todaySteps",
      COALESCE(SUM(CASE WHEN w."day" >= CURRENT_DATE - INTERVAL '6 days' THEN w."steps" ELSE 0 END), 0)::int AS "sevenDaySteps",
      COALESCE(SUM(CASE WHEN w."day" >= CURRENT_DATE - INTERVAL '6 days' THEN w."distanceMeters" ELSE 0 END), 0)::float8 AS "sevenDayDistanceMeters",
      MAX(w."syncedAt") AS "lastSyncedAt"
    FROM "Student" s
    LEFT JOIN "StudentWalkingDailyStat" w
      ON w."studentId" = s."id"
      AND w."day" >= CURRENT_DATE - INTERVAL '6 days'
      AND w."day" <= CURRENT_DATE
    WHERE s."classroomId" = ${classroomId}
    GROUP BY s."id", s."number", s."name"
    ORDER BY s."number" ASC NULLS LAST, s."name" ASC
  `);

  return rows.map((row) => ({
    studentId: row.studentId,
    studentNumber: row.studentNumber,
    studentName: row.studentName,
    todaySteps: Number(row.todaySteps) || 0,
    sevenDaySteps: Number(row.sevenDaySteps) || 0,
    sevenDayDistanceMeters: Number(row.sevenDayDistanceMeters) || 0,
    lastSyncedAt: normalizeDate(row.lastSyncedAt),
  }));
}
