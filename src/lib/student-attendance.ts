import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { db } from "./db";
import { ensureAccountFor } from "./bank";
import {
  awardActivityReward,
  retryActivityRewardTransaction,
} from "./creatures/activity-rewards";
import {
  getKstRewardMonthRange,
  isMonthlyAttendanceCookieRewardOrdinal,
  MONTHLY_ATTENDANCE_COOKIE_ITEM_KEY,
  MONTHLY_ATTENDANCE_COOKIE_REWARD_SOURCE_TYPE,
  MONTHLY_ATTENDANCE_ITEM_ORDINAL,
  MONTHLY_ATTENDANCE_ORDINALS,
  MONTHLY_ATTENDANCE_REWARD_SOURCE_TYPE,
  monthlyAttendanceCookieRewardSourceRef,
  monthlyAttendanceRewardAmount,
  monthlyAttendanceSourceRef,
} from "./reward-policy";
import { getWalkingDayKey } from "./walking";

export type MonthlyAttendanceSummary = {
  month: string;
  monthDays: number;
  attendanceCount: number;
  attendanceDays: string[];
  visitCount: number;
  claimedOrdinals: number[];
  claimableAttendance: Array<{ ordinal: number; day: string }>;
  itemRewardOrdinal: number;
  itemEarned: boolean;
  nextOrdinalReward: {
    ordinal: number;
    type: "cash" | "item";
    amount: number;
  } | null;
};

type AttendanceRow = {
  day: Date | string;
  ordinal: number;
  claimedAt: Date | string | null;
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidAttendanceDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function dayKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function getStudentMonthlyAttendance(
  studentId: string,
  monthRange = getKstRewardMonthRange(),
): Promise<MonthlyAttendanceSummary> {
  const rows = await db.$queryRaw<AttendanceRow[]>(Prisma.sql`
    SELECT "day", "ordinal", "claimedAt"
    FROM "StudentAttendance"
    WHERE "studentId" = ${studentId}
      AND "month" = ${monthRange.month}
    ORDER BY "ordinal" ASC
  `);
  const claimedRows = rows.filter((row) => row.claimedAt != null);
  const claimableAttendance = rows
    .filter((row) => row.claimedAt == null)
    .map((row) => ({ ordinal: row.ordinal, day: dayKey(row.day) }));
  // `attendanceCount` drives the calendar's earned stamps, so it counts claims
  // rather than visits. Visits are reported separately.
  const attendanceDays = claimedRows.map((row) => dayKey(row.day));
  const attendanceCount = claimedRows.length;
  const visitCount = rows.length;
  const nextOrdinal =
    claimableAttendance[0]?.ordinal ??
    (visitCount < MONTHLY_ATTENDANCE_ORDINALS ? visitCount + 1 : null);
  return {
    month: monthRange.month,
    monthDays: MONTHLY_ATTENDANCE_ORDINALS,
    attendanceCount,
    attendanceDays,
    visitCount,
    claimedOrdinals: claimedRows.map((row) => row.ordinal),
    claimableAttendance,
    itemRewardOrdinal: MONTHLY_ATTENDANCE_ITEM_ORDINAL,
    itemEarned: claimedRows.some(
      (row) => row.ordinal === MONTHLY_ATTENDANCE_ITEM_ORDINAL,
    ),
    nextOrdinalReward: nextOrdinal
      ? {
          ordinal: nextOrdinal,
          type: nextOrdinal === MONTHLY_ATTENDANCE_ITEM_ORDINAL ? "item" : "cash",
          amount:
            nextOrdinal === MONTHLY_ATTENDANCE_ITEM_ORDINAL
              ? 0
              : monthlyAttendanceRewardAmount(nextOrdinal),
        }
      : null,
  };
}

async function awardAttendanceCookie(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    classroomId: string;
    accountId: string;
    month: string;
    ordinal: number;
    attendedDay: string;
  },
): Promise<void> {
  if (!isMonthlyAttendanceCookieRewardOrdinal(input.ordinal)) return;
  const sourceRef = monthlyAttendanceCookieRewardSourceRef(
    input.studentId,
    input.month,
    input.ordinal,
  );
  const existing = await tx.transaction.findFirst({
    where: {
      sourceType: MONTHLY_ATTENDANCE_COOKIE_REWARD_SOURCE_TYPE,
      sourceRef,
      type: "item_grant",
    },
    select: { id: true },
  });
  if (existing) return;

  const account = await tx.studentAccount.findUniqueOrThrow({
    where: { id: input.accountId },
    select: { balance: true, studentId: true, classroomId: true },
  });
  if (account.studentId !== input.studentId || account.classroomId !== input.classroomId) {
    throw new Error("attendance_cookie_reward_account_mismatch");
  }
  await tx.transaction.create({
    data: {
      accountId: input.accountId,
      type: "item_grant",
      amount: 0,
      balanceAfter: account.balance,
      note: `월간 출석 ${input.ordinal}일차 쿠키 보상 [${input.month}:${input.attendedDay}]`,
      sourceType: MONTHLY_ATTENDANCE_COOKIE_REWARD_SOURCE_TYPE,
      sourceRef,
      performedById: input.studentId,
      performedByKind: "system",
    },
  });
  await tx.studentCreatureItem.upsert({
    where: { studentId_itemKey: { studentId: input.studentId, itemKey: MONTHLY_ATTENDANCE_COOKIE_ITEM_KEY } },
    create: {
      studentId: input.studentId,
      classroomId: input.classroomId,
      itemKey: MONTHLY_ATTENDANCE_COOKIE_ITEM_KEY,
      itemKind: "food",
      quantity: 1,
    },
    update: { itemKind: "food", quantity: { increment: 1 } },
  });
}

/**
 * Record one student-app visit. Replays for the same KST day are idempotent.
 * Visits only open a claimable ordinal; the student claims the reward itself.
 */
export async function recordStudentAttendanceVisit(student: {
  id: string;
  classroomId: string;
}): Promise<MonthlyAttendanceSummary> {
  const day = getWalkingDayKey();
  const month = day.slice(0, 7);

  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtext(${student.id}), hashtext(${month}))
      `);
      await tx.$executeRaw(Prisma.sql`
        WITH next_ordinal AS (
          SELECT COALESCE(MAX("ordinal"), 0) + 1 AS ordinal
          FROM "StudentAttendance"
          WHERE "studentId" = ${student.id} AND "month" = ${month}
        )
        INSERT INTO "StudentAttendance" (
          "id", "studentId", "day", "month", "ordinal", "visitedAt", "createdAt"
        )
        SELECT
          ${randomUUID()}, ${student.id}, ${day}::date, ${month}, ordinal,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM next_ordinal
        WHERE ordinal <= ${MONTHLY_ATTENDANCE_ORDINALS}
        ON CONFLICT ("studentId", "day") DO NOTHING
      `);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return getStudentMonthlyAttendance(student.id);
}

/**
 * Claim the reward for one visited-but-unclaimed ordinal. The claim marker is
 * set inside the same transaction as the payout so a replay cannot pay twice.
 */
export async function claimStudentAttendanceReward(
  student: { id: string; classroomId: string },
  day: string,
): Promise<MonthlyAttendanceSummary> {
  if (!isValidAttendanceDay(day)) throw new Error("invalid_attendance_day");
  const month = day.slice(0, 7);
  const { accountId } = await ensureAccountFor(student);

  await retryActivityRewardTransaction(() =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtext(${student.id}), hashtext(${month}))
        `);
        const claimed = await tx.$queryRaw<Array<{ ordinal: number }>>(Prisma.sql`
          UPDATE "StudentAttendance"
          SET "claimedAt" = CURRENT_TIMESTAMP
          WHERE "studentId" = ${student.id}
            AND "day" = ${day}::date
            AND "claimedAt" IS NULL
          RETURNING "ordinal"
        `);
        const ordinal = Number(claimed[0]?.ordinal);
        if (!Number.isSafeInteger(ordinal)) return;

        if (ordinal !== MONTHLY_ATTENDANCE_ITEM_ORDINAL) {
          await awardActivityReward({
            tx,
            studentId: student.id,
            classroomId: student.classroomId,
            accountId,
            sourceType: MONTHLY_ATTENDANCE_REWARD_SOURCE_TYPE,
            sourceRef: monthlyAttendanceSourceRef(student.id, month, ordinal),
            amount: monthlyAttendanceRewardAmount(ordinal),
            note: `월간 출석 ${ordinal}일차 보상 [${month}:${day}]`,
          });
        }
        await awardAttendanceCookie(tx, {
          studentId: student.id,
          classroomId: student.classroomId,
          accountId,
          month,
          ordinal,
          attendedDay: day,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  return getStudentMonthlyAttendance(student.id);
}
