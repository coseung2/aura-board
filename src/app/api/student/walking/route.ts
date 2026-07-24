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
  getWalkingWeeklyRewardTiers,
  getKstWeekStartDay,
  walkingRewardUnits,
  walkingMonthlyAttendanceRewardAmount,
  walkingMonthlyAttendanceSourceRef,
  walkingMonthlyCookieRewardSourceRef,
  isWalkingMonthlyCookieRewardOrdinal,
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

type RawWalkingRow = {
  day: Date | string;
  steps: number;
  distanceMeters: number;
  syncedAt: Date | string;
  attendanceVisitedAt?: Date | string | null;
  attendanceMonth?: string | null;
  attendanceOrdinal?: number | null;
  attendanceCompletedAt?: Date | string | null;
};

class WalkingAttendanceEligibilityError extends Error {
  constructor(readonly days: string[]) {
    super("attendance_day_not_synced");
    this.name = "WalkingAttendanceEligibilityError";
  }
}

function toDayKey(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseDays(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days") ?? "7");
  if (!Number.isFinite(raw)) return 7;
  return Math.min(31, Math.max(1, Math.round(raw)));
}

type WalkingReadWindow = {
  startDay: string;
  endDayExclusive: string;
};

type WalkingResponseRange = {
  /** KST Monday at 00:00, represented as an inclusive calendar date. */
  weekStart: string;
  /** Next KST Monday at 00:00, represented as an exclusive calendar date. */
  weekEnd: string;
};

type MonthlyAttendanceReward = {
  month: string;
  monthDays: number;
  attendanceCount: number;
  visitCount: number;
  claimedOrdinals: number[];
  claimableAttendance: Array<{ ordinal: number; day: string }>;
  /** Dates the student has explicitly checked in during this month. */
  attendanceDays: string[];
  /** Synced, non-future dates that can still be checked in. */
  eligibleAttendanceDays: string[];
  cashEarned: number;
  cashPaid: number;
  nextOrdinalReward: {
    ordinal: number;
    type: "cash" | "item";
    amount: number;
  } | null;
  itemRewardOrdinal: number;
  itemEarned: boolean;
};

type WeeklyStepReward = {
  key: string;
  steps: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
};

type WeeklyStepRewards = {
  weekStart: string;
  totalSteps: number;
  maxSteps: number;
  tiers: WeeklyStepReward[];
};

type ClassroomWalkingRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklySteps: number | bigint;
};

function parseReadWindow(
  request: NextRequest,
  now = new Date(),
): { window: WalkingReadWindow; range: WalkingResponseRange } {
  const week = request.nextUrl.searchParams.get("week");
  const hasDays = request.nextUrl.searchParams.has("days");
  const range = getKstRewardWeekRange(now);

  // The default response is the fixed KST Monday-to-next-Monday window. Keep
  // `days` as an explicit compatibility escape hatch for existing consumers.
  if (week === "current" || (!hasDays && week !== "rolling")) {
    return {
      window: { startDay: range.weekStart, endDayExclusive: range.weekEnd },
      range,
    };
  }

  const days = parseDays(request);
  const maxDay = getWalkingDayKey(now);
  return {
    window: {
      startDay: addWalkingDays(maxDay, -(days - 1)),
      endDayExclusive: addWalkingDays(maxDay, 1),
    },
    // Preserve the policy range metadata even when rows use the legacy
    // rolling-days query so clients can label the current fixed week clearly.
    range,
  };
}

async function readRows(studentId: string, window: WalkingReadWindow) {
  const rows = await db.$queryRaw<RawWalkingRow[]>(Prisma.sql`
    SELECT
      "day",
      "steps",
      "distanceMeters",
      "syncedAt",
      "attendanceVisitedAt",
      "attendanceMonth",
      "attendanceOrdinal",
      "attendanceCompletedAt"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= ${window.startDay}::date
      AND "day" < ${window.endDayExclusive}::date
    ORDER BY "day" ASC
  `);

  const legacyOrdinalByDay = new Map<string, number>();
  return rows.map((row) => {
    const syncedAt =
      row.syncedAt instanceof Date
        ? row.syncedAt.toISOString()
        : new Date(row.syncedAt).toISOString();
    // Before the attendance marker was added, route tests and older mocked
    // database adapters may omit the selected field altogether. Treat that
    // shape as legacy auto-attendance, while an explicit SQL NULL remains an
    // uncompleted, catch-up-eligible day.
    const hasAttendanceField = Object.prototype.hasOwnProperty.call(
      row,
      "attendanceCompletedAt",
    );
    const attendanceCompletedAt =
      row.attendanceCompletedAt == null
        ? hasAttendanceField
          ? null
          : syncedAt
        : row.attendanceCompletedAt instanceof Date
          ? row.attendanceCompletedAt.toISOString()
          : new Date(row.attendanceCompletedAt).toISOString();
    const attendanceVisitedAt =
      row.attendanceVisitedAt == null
        ? attendanceCompletedAt
        : row.attendanceVisitedAt instanceof Date
          ? row.attendanceVisitedAt.toISOString()
          : new Date(row.attendanceVisitedAt).toISOString();
    const day = toDayKey(row.day);
    if (
      attendanceVisitedAt &&
      row.attendanceOrdinal == null &&
      !legacyOrdinalByDay.has(day)
    ) {
      legacyOrdinalByDay.set(day, legacyOrdinalByDay.size + 1);
    }
    return {
      day,
      steps: Number(row.steps) || 0,
      distanceMeters: Number(row.distanceMeters) || 0,
      syncedAt,
      attendanceVisitedAt,
      attendanceMonth:
        row.attendanceMonth ?? (attendanceVisitedAt ? day.slice(0, 7) : null),
      attendanceOrdinal:
        row.attendanceOrdinal ?? legacyOrdinalByDay.get(day) ?? null,
      attendanceCompletedAt,
    };
  });
}

function attendanceDaysInOrder(
  rows: Array<{ day: string; attendanceCompletedAt?: string | null }>,
) {
  return [...new Set(rows.map((row) => row.day))].sort((a, b) => a.localeCompare(b));
}

function buildMonthlyAttendanceReward(
  monthRange: ReturnType<typeof getKstRewardMonthRange>,
  rows: Array<{
    day: string;
    attendanceCompletedAt?: string | null;
    attendanceVisitedAt?: string | null;
    attendanceMonth?: string | null;
    attendanceOrdinal?: number | null;
    syncedAt?: string | null;
  }>,
  paidByOrdinal: ReadonlyMap<number, number>,
): MonthlyAttendanceReward {
  const monthRows = rows.filter(
    (row) => row.day >= monthRange.monthStart && row.day < monthRange.monthEnd,
  );
  const attendanceDays = attendanceDaysInOrder(
    monthRows.filter((row) => row.attendanceCompletedAt != null),
  );
  const attendanceRows = monthRows
    .filter(
      (row) =>
        row.attendanceVisitedAt != null &&
        row.attendanceOrdinal != null &&
        row.attendanceOrdinal >= 1 &&
        row.attendanceOrdinal <= WALKING_MONTHLY_ATTENDANCE_ORDINALS,
    )
    .sort((a, b) => (a.attendanceOrdinal ?? 0) - (b.attendanceOrdinal ?? 0));
  const claimedOrdinals = [
    ...new Set(
      attendanceRows
        .filter((row) => row.attendanceCompletedAt != null)
        .map((row) => row.attendanceOrdinal as number),
    ),
  ];
  const claimableAttendance = [
    ...new Map(
      attendanceRows
        .filter((row) => row.attendanceCompletedAt == null)
        .map((row) => [
          row.attendanceOrdinal as number,
          { ordinal: row.attendanceOrdinal as number, day: row.day },
        ] as const),
    ).values(),
  ];
  const eligibleAttendanceDays = claimableAttendance.map((entry) => entry.day);
  const attendanceCount = claimedOrdinals.length;
  const visitCount = new Set(
    attendanceRows.map((row) => row.attendanceOrdinal as number),
  ).size;
  const itemRewardOrdinal = WALKING_MONTHLY_ATTENDANCE_ITEM_ORDINAL;
  let cashEarned = 0;
  let cashPaid = 0;
  for (const ordinal of claimedOrdinals) {
    if (ordinal === itemRewardOrdinal) continue;
    cashEarned += walkingMonthlyAttendanceRewardAmount(ordinal);
    cashPaid += paidByOrdinal.get(ordinal) ?? 0;
  }
  const nextOrdinal =
    claimableAttendance[0]?.ordinal ??
    (visitCount < WALKING_MONTHLY_ATTENDANCE_ORDINALS
      ? Math.max(0, ...attendanceRows.map((row) => row.attendanceOrdinal ?? 0)) + 1
      : null);
  const nextOrdinalReward = nextOrdinal
    ? {
        ordinal: nextOrdinal,
        type: nextOrdinal === itemRewardOrdinal ? ("item" as const) : ("cash" as const),
        amount:
          nextOrdinal === itemRewardOrdinal
            ? 0
            : walkingMonthlyAttendanceRewardAmount(nextOrdinal),
      }
    : null;
  return {
    month: monthRange.month,
    monthDays: WALKING_MONTHLY_ATTENDANCE_ORDINALS,
    attendanceCount,
    visitCount,
    claimedOrdinals,
    claimableAttendance,
    attendanceDays: attendanceDays.slice(0, WALKING_MONTHLY_ATTENDANCE_ORDINALS),
    eligibleAttendanceDays: eligibleAttendanceDays.filter(
      (day) => !attendanceDays.includes(day),
    ),
    cashEarned,
    cashPaid,
    nextOrdinalReward,
    itemRewardOrdinal,
    itemEarned: claimedOrdinals.includes(itemRewardOrdinal),
  };
}

async function readMonthlyAttendanceReward(
  studentId: string,
  monthRange = getKstRewardMonthRange(),
  rows?: Array<{
    day: string;
    attendanceCompletedAt?: string | null;
    attendanceVisitedAt?: string | null;
    attendanceMonth?: string | null;
    attendanceOrdinal?: number | null;
    syncedAt?: string | null;
  }>,
): Promise<MonthlyAttendanceReward> {
  const attendanceRows = rows ??
    await readRows(studentId, {
      startDay: monthRange.monthStart,
      endDayExclusive: monthRange.monthEnd,
    });
  const prefix = `${studentId}:${monthRange.month}:attendance:`;
  const deposits = await db.transaction.findMany({
    where: {
      sourceType: WALKING_MONTHLY_REWARD_SOURCE_TYPE,
      sourceRef: { startsWith: prefix },
      type: "deposit",
    },
    select: { sourceRef: true, amount: true },
  });
  const paidByOrdinal = new Map<number, number>();
  for (const deposit of deposits) {
    const sourceRef = deposit.sourceRef ?? "";
    const ordinal = Number(sourceRef.slice(prefix.length));
    if (
      !Number.isSafeInteger(ordinal) ||
      ordinal < 1 ||
      ordinal > WALKING_MONTHLY_ATTENDANCE_ORDINALS
    ) {
      continue;
    }
    paidByOrdinal.set(ordinal, (paidByOrdinal.get(ordinal) ?? 0) + Number(deposit.amount) || 0);
  }
  return buildMonthlyAttendanceReward(monthRange, attendanceRows, paidByOrdinal);
}

async function readWeeklyStepRewards(
  studentId: string,
  range: WalkingResponseRange,
  policy: Awaited<ReturnType<typeof loadRewardPolicy>>,
  rows?: Array<{ day: string; steps: number }>,
): Promise<WeeklyStepRewards> {
  const weekRows = rows ??
    await readRows(studentId, {
      startDay: range.weekStart,
      endDayExclusive: range.weekEnd,
    });
  const totalSteps = weekRows.reduce(
    (sum, row) => sum + (Number.isSafeInteger(row.steps) ? Math.max(0, row.steps) : 0),
    0,
  );
  const weeklyTiers = getWalkingWeeklyRewardTiers(policy);
  const tierSourceRefs = weeklyTiers.map((tier) =>
    walkingWeeklyTierSourceRef(studentId, range.weekStart, tier.key),
  );
  // `weekly-goal` is the pre-tier source used by historical automatic payouts.
  // It settles tier 1 for the week so old rewards remain visibly claimed.
  const legacyTier1SourceRef = walkingWeeklyGoalSourceRef(studentId, range.weekStart);
  const deposits = await db.transaction.findMany({
    where: {
      sourceType: WALKING_WEEKLY_REWARD_SOURCE_TYPE,
      sourceRef: { in: [...tierSourceRefs, legacyTier1SourceRef] },
      type: "deposit",
    },
    select: { sourceRef: true },
  });
  const claimedRefs = new Set(
    deposits
      .map((deposit) => deposit.sourceRef)
      .filter((sourceRef): sourceRef is string => Boolean(sourceRef)),
  );
  const maxSteps = weeklyTiers.reduce(
    (max, tier) => Math.max(max, Number.isSafeInteger(tier.steps) ? Math.max(0, tier.steps) : 0),
    0,
  );
  return {
    weekStart: range.weekStart,
    totalSteps,
    maxSteps,
    tiers: weeklyTiers.map((tier) => ({
      key: tier.key,
      steps: tier.steps,
      amount: tier.amount,
      achieved:
        Number.isSafeInteger(tier.steps) && tier.steps > 0 && totalSteps >= tier.steps,
      claimed:
        claimedRefs.has(walkingWeeklyTierSourceRef(studentId, range.weekStart, tier.key)) ||
        (tier.key === "tier1" && claimedRefs.has(legacyTier1SourceRef)),
    })),
  };
}

async function readClassroomTopFive(
  classroomId: string,
  range: WalkingResponseRange,
  currentStudentId: string,
) {
  const ranks = await db.$queryRaw<ClassroomWalkingRank[]>(Prisma.sql`
    SELECT
      student."id" AS "studentId",
      student."number" AS "studentNumber",
      student."name" AS "studentName",
      COALESCE(SUM(walking."steps"), 0)::bigint AS "weeklySteps"
    FROM "Student" student
    LEFT JOIN "StudentWalkingDailyStat" walking
      ON walking."studentId" = student."id"
      AND walking."day" >= ${range.weekStart}::date
      AND walking."day" < ${range.weekEnd}::date
    WHERE student."classroomId" = ${classroomId}
    GROUP BY student."id", student."number", student."name"
    ORDER BY "weeklySteps" DESC, student."number" ASC NULLS LAST, student."name" ASC
    LIMIT 5
  `);

  return ranks
    .filter(
      (rank) =>
        typeof rank.studentId === "string" &&
        typeof rank.studentName === "string" &&
        (typeof rank.weeklySteps === "number" || typeof rank.weeklySteps === "bigint"),
    )
    .map((rank) => ({
      studentId: rank.studentId,
      studentNumber: Number.isInteger(rank.studentNumber) ? rank.studentNumber : null,
      studentName: rank.studentName,
      weeklySteps: Number(rank.weeklySteps) || 0,
      isCurrent: rank.studentId === currentStudentId,
    }));
}

export async function GET(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    }

    const readRange = parseReadWindow(request);
    const policy = await db.$transaction((tx) =>
      loadRewardPolicy(tx, student.classroomId),
    );
    const rows = await readRows(student.id, readRange.window);
    const weeklyRows =
      readRange.window.startDay === readRange.range.weekStart &&
      readRange.window.endDayExclusive === readRange.range.weekEnd
        ? rows
        : undefined;
    const weeklyStepRewards = await readWeeklyStepRewards(
      student.id,
      readRange.range,
      policy,
      weeklyRows,
    );
    const monthRange = getKstRewardMonthRange();
    const monthRows = await readRows(student.id, {
      startDay: monthRange.monthStart,
      endDayExclusive: monthRange.monthEnd,
    });
    const monthlyAttendanceReward = await readMonthlyAttendanceReward(
      student.id,
      monthRange,
      monthRows,
    );
    const classroomTopFive = await readClassroomTopFive(
      student.classroomId,
      readRange.range,
      student.id,
    );
    const syncedDays = rows
      .filter((row) => row.syncedAt != null)
      .map((row) => row.day);
    const completedAttendanceDays = rows
      .filter((row) => row.attendanceCompletedAt != null)
      .map((row) => row.day);
    return jsonPrivateNoStore({
      rows,
      range: readRange.range,
      syncedDays,
      completedAttendanceDays,
      policy: {
        stepThreshold: policy.walkingRewardStepThreshold,
        dailyUnitAmount: policy.walkingRewardAmount,
        dailyUnitCap: policy.walkingDailyUnitCap,
        weeklyRewardDayCap: policy.walkingWeeklyRewardDayCap,
        weeklyTiers: getWalkingWeeklyRewardTiers(policy).map(
          ({ key, steps, amount }) => ({ key, steps, amount }),
        ),
      },
      monthlyAttendanceReward,
      weeklyStepRewards,
      classroomTopFive,
    });
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
    const attendanceVisitDay = parsed.data.attendanceVisit
      ? getWalkingDayKey()
      : null;

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
      ...sortedRows.flatMap((row) => [
        walkingUnitSourceRef(student.id, row.day, 1),
        walkingUnitSourceRef(student.id, row.day, 2),
        walkingUnitSourceRef(student.id, row.day, 3),
        walkingUnitSourceRef(student.id, row.day, 4),
      ]),
      ...monthlySourceRefs,
      ...monthlyCookieSourceRefs,
    ];
    await retryActivityRewardTransaction(
      () =>
        db.$transaction(
          async (tx) => {
            const policy = await loadRewardPolicy(tx, student.classroomId);

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

            if (attendanceVisitDay) {
              const attendanceMonth = attendanceVisitDay.slice(0, 7);
              await tx.$executeRaw(Prisma.sql`
                SELECT pg_advisory_xact_lock(
                  hashtext(${student.id}),
                  hashtext(${attendanceMonth})
                )
              `);
              await tx.$executeRaw(Prisma.sql`
                WITH next_ordinal AS (
                  SELECT COALESCE(MAX("attendanceOrdinal"), 0) + 1 AS ordinal
                  FROM "StudentWalkingDailyStat"
                  WHERE "studentId" = ${student.id}
                    AND "attendanceMonth" = ${attendanceMonth}
                )
                INSERT INTO "StudentWalkingDailyStat" (
                  "id",
                  "studentId",
                  "day",
                  "steps",
                  "distanceMeters",
                  "source",
                  "syncedAt",
                  "attendanceVisitedAt",
                  "attendanceMonth",
                  "attendanceOrdinal",
                  "createdAt",
                  "updatedAt"
                ) SELECT
                  ${randomUUID()},
                  ${student.id},
                  ${attendanceVisitDay}::date,
                  0,
                  0,
                  'app_visit',
                  CURRENT_TIMESTAMP,
                  CURRENT_TIMESTAMP,
                  ${attendanceMonth},
                  ordinal,
                  CURRENT_TIMESTAMP,
                  CURRENT_TIMESTAMP
                FROM next_ordinal
                WHERE ordinal <= ${WALKING_MONTHLY_ATTENDANCE_ORDINALS}
                ON CONFLICT ("studentId", "day") DO UPDATE SET
                  "attendanceVisitedAt" = COALESCE(
                    "StudentWalkingDailyStat"."attendanceVisitedAt",
                    CURRENT_TIMESTAMP
                  ),
                  "attendanceMonth" = COALESCE(
                    "StudentWalkingDailyStat"."attendanceMonth",
                    EXCLUDED."attendanceMonth"
                  ),
                  "attendanceOrdinal" = COALESCE(
                    "StudentWalkingDailyStat"."attendanceOrdinal",
                    EXCLUDED."attendanceOrdinal"
                  ),
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
                    "walking_reward",
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

            for (const row of sortedRows) {
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
                  /^[^:]+:(\d{4}-\d{2}-\d{2}):(?:unit:[1-4]|daily-threshold)$/,
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
    const responseMonthRows = responseRows.filter(
      (row) =>
        row.day >= responseMonthRange.monthStart &&
        row.day < responseMonthRange.monthEnd,
    );
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
      monthlyAttendanceReward: await readMonthlyAttendanceReward(
        student.id,
        responseMonthRange,
        responseMonthRows,
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
