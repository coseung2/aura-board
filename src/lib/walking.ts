import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

export const WALKING_TIME_ZONE = "Asia/Seoul";

const WALKING_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const walkingDateFormatter = new Intl.DateTimeFormat("en-US", {
  calendar: "iso8601",
  numberingSystem: "latn",
  timeZone: WALKING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Validate both the YYYY-MM-DD shape and the Gregorian calendar date. */
export function isValidWalkingDay(value: unknown): value is string {
  if (typeof value !== "string" || !WALKING_DAY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  // Date.UTC treats years 0-99 as 1900-1999, so set the full year after
  // constructing a known-safe date instead.
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Return the canonical KST calendar day for an instant. */
export function getWalkingDayKey(value: Date = new Date()): string {
  if (Number.isNaN(value.getTime())) throw new RangeError("invalid_date");
  const parts = Object.fromEntries(
    walkingDateFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function walkingDayToUtc(value: string) {
  if (!isValidWalkingDay(value)) throw new RangeError("invalid_day");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  return date;
}

/** Shift a canonical walking day without using the server's local timezone. */
export function addWalkingDays(value: string, amount: number): string {
  if (!Number.isInteger(amount)) throw new RangeError("invalid_day_offset");
  const date = walkingDayToUtc(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getWalkingDayRange(
  now: Date = new Date(),
  days = 31,
) {
  const safeDays = Number.isFinite(days)
    ? Math.min(31, Math.max(1, Math.round(days)))
    : 31;
  const maxDay = getWalkingDayKey(now);
  return { minDay: addWalkingDays(maxDay, -(safeDays - 1)), maxDay };
}

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
  const safeDays = Number.isFinite(days)
    ? Math.min(31, Math.max(1, Math.round(days)))
    : 7;
  const rows = await db.$queryRaw<RawWalkingDay[]>(Prisma.sql`
    SELECT "day", "steps", "distanceMeters", "syncedAt"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - (${safeDays - 1})::int)
      AND "day" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
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
      COALESCE(SUM(CASE WHEN w."day" = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date THEN w."steps" ELSE 0 END), 0)::int AS "todaySteps",
      COALESCE(SUM(CASE WHEN w."day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 6) THEN w."steps" ELSE 0 END), 0)::int AS "sevenDaySteps",
      COALESCE(SUM(CASE WHEN w."day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 6) THEN w."distanceMeters" ELSE 0 END), 0)::float8 AS "sevenDayDistanceMeters",
      MAX(w."syncedAt") AS "lastSyncedAt"
    FROM "Student" s
    LEFT JOIN "StudentWalkingDailyStat" w
      ON w."studentId" = s."id"
      AND w."day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 6)
      AND w."day" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
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
