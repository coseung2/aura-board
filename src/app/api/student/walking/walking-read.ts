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

export class WalkingAttendanceEligibilityError extends Error {
  constructor(readonly days: string[]) {
    super("attendance_day_not_synced");
    this.name = "WalkingAttendanceEligibilityError";
  }
}

export function toDayKey(value: Date | string) {
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

export function attendanceForWalkingClient(
  attendance: MonthlyAttendanceSummary,
): MonthlyAttendanceReward {
  const cashEarned = attendance.claimedOrdinals
    .filter((ordinal) => ordinal !== attendance.itemRewardOrdinal)
    .reduce((sum, ordinal) => sum + walkingMonthlyAttendanceRewardAmount(ordinal), 0);
  return {
    ...attendance,
    eligibleAttendanceDays: attendance.claimableAttendance.map((entry) => entry.day),
    cashEarned,
    cashPaid: cashEarned,
  };
}

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

type DailyStepReward = {
  unit: number;
  steps: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
  claimable: boolean;
};

type DailyStepRewards = {
  day: string;
  totalSteps: number;
  tiers: DailyStepReward[];
};

type WalkingRepresentativeSlime = {
  color: string;
  growthStage: 1 | 2 | 3;
  equippedFloor: SlimeFloor;
};

type ClassroomWalkingRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklySteps: number | bigint;
};

type ClassroomRankReward = {
  weekStart: string;
  rank: number;
  amount: number;
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

export async function readRows(studentId: string, window: WalkingReadWindow) {
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

async function readDailyStepRewards(
  studentId: string,
  policy: Awaited<ReturnType<typeof loadRewardPolicy>>,
  rows?: Array<{ day: string; steps: number }>,
): Promise<DailyStepRewards> {
  const day = getWalkingDayKey();
  // The mobile snapshot is always the current week, so today's row is already
  // available here.  Avoid a second read solely for the reward strip.
  const row = rows?.find((candidate) => candidate.day === day);
  const rowSteps = row?.steps;
  const totalSteps =
    typeof rowSteps === "number" && Number.isSafeInteger(rowSteps)
      ? Math.max(0, rowSteps)
      : 0;
  const earnedUnits = walkingRewardUnits(
    totalSteps,
    policy.walkingRewardStepThreshold,
    policy.walkingDailyUnitCap,
  );
  const range = getKstRewardWeekRange();
  const deposits = await db.transaction.findMany({
    where: {
      sourceType: "walking_reward",
      sourceRef: { startsWith: `${studentId}:` },
      type: "deposit",
    },
    select: { sourceRef: true },
  });
  const claimedRefs = new Set(
    deposits
      .map((deposit) => deposit.sourceRef)
      .filter((sourceRef): sourceRef is string => Boolean(sourceRef)),
  );
  const legacySourceRef = `${studentId}:${day}:daily-threshold`;
  const legacyClaimed = claimedRefs.has(legacySourceRef);
  const rewardedDays = new Set<string>();
  for (const sourceRef of claimedRefs) {
    const match = sourceRef.match(
      /^[^:]+:(\d{4}-\d{2}-\d{2}):(?:unit:[1-4]|daily-threshold)$/,
    );
    if (match && getKstWeekStartDay(match[1]) === range.weekStart) {
      rewardedDays.add(match[1]);
    }
  }
  const canClaimDay = canRewardWalkingDay(
    rewardedDays,
    day,
    policy.walkingWeeklyRewardDayCap,
  );

  return {
    day,
    totalSteps,
    tiers: Array.from({ length: policy.walkingDailyUnitCap }, (_, index) => {
      const unit = index + 1;
      const achieved = unit <= earnedUnits;
      const claimed = legacyClaimed || claimedRefs.has(walkingUnitSourceRef(studentId, day, unit));
      return {
        unit,
        steps: policy.walkingRewardStepThreshold * unit,
        amount: policy.walkingRewardAmount,
        achieved,
        claimed,
        claimable: achieved && !claimed && canClaimDay,
      };
    }),
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
    HAVING COALESCE(SUM(walking."steps"), 0) > 0
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
    .map((rank, index) => ({
      studentId: rank.studentId,
      studentNumber: Number.isInteger(rank.studentNumber) ? rank.studentNumber : null,
      studentName: rank.studentName,
      weeklySteps: Number(rank.weeklySteps) || 0,
      isCurrent: rank.studentId === currentStudentId,
      rewardAmount: WALKING_CLASSROOM_RANK_REWARDS[index] ?? 0,
    }));
}

async function readClassroomRankReward(
  classroomId: string,
  studentId: string,
  range: WalkingResponseRange,
): Promise<Omit<ClassroomRankReward, "weekStart"> | null> {
  const rows = await db.$queryRaw<Array<{ rank: bigint | number }>>(Prisma.sql`
    WITH ranked AS (
      SELECT
        student."id" AS "studentId",
        ROW_NUMBER() OVER (
          ORDER BY
            COALESCE(SUM(walking."steps"), 0) DESC,
            student."number" ASC NULLS LAST,
            student."name" ASC
        ) AS "rank"
      FROM "Student" student
      LEFT JOIN "StudentWalkingDailyStat" walking
        ON walking."studentId" = student."id"
        AND walking."day" >= ${range.weekStart}::date
        AND walking."day" < ${range.weekEnd}::date
      WHERE student."classroomId" = ${classroomId}
      GROUP BY student."id", student."number", student."name"
      HAVING COALESCE(SUM(walking."steps"), 0) > 0
    )
    SELECT "rank"
    FROM ranked
    WHERE "studentId" = ${studentId}
  `);
  const rank = Number(rows[0]?.rank);
  const amount = Number.isSafeInteger(rank) && rank > 0
    ? WALKING_CLASSROOM_RANK_REWARDS[rank - 1]
    : undefined;
  if (amount === undefined) return null;

  return { rank, amount };
}

async function readUnclaimedClassroomRankRewards(
  classroomId: string,
  studentId: string,
): Promise<ClassroomRankReward[]> {
  const periods = getKstClassroomWalkingRankRewardPeriods();
  if (periods.length === 0) return [];

  const deposits = await db.transaction.findMany({
    where: {
      sourceType: WALKING_CLASSROOM_RANK_REWARD_SOURCE_TYPE,
      sourceRef: { startsWith: `${studentId}:` },
      type: "deposit",
    },
    select: { sourceRef: true },
  });
  const claimedRefs = new Set(
    deposits
      .map((deposit) => deposit.sourceRef)
      .filter((sourceRef): sourceRef is string => Boolean(sourceRef)),
  );

  const rewards = await Promise.all(
    periods.map(async (period) => {
      const sourceRef = walkingClassroomRankRewardSourceRef(studentId, period.weekStart);
      if (claimedRefs.has(sourceRef)) return null;
      const reward = await readClassroomRankReward(classroomId, studentId, period);
      return reward ? { weekStart: period.weekStart, ...reward } : null;
    }),
  );
  return rewards
    .filter((reward): reward is ClassroomRankReward => reward !== null)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export async function handleWalkingGet(request: NextRequest) {
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
    const [weeklyStepRewards, dailyStepRewards, representativeSlime] = await Promise.all([
      readWeeklyStepRewards(
        student.id,
        readRange.range,
        policy,
        weeklyRows,
      ),
      readDailyStepRewards(student.id, policy, rows),
      db.studentSlime.findFirst({
        where: { studentId: student.id, isRepresentative: true },
        select: { color: true, growthStage: true, equippedItemKeys: true },
      }),
    ]);
    const monthlyAttendanceReward = attendanceForWalkingClient(
      await getStudentMonthlyAttendance(student.id),
    );
    const classroomRankPeriods = getKstClassroomWalkingRankPeriods();
    const classroomTopFive = await readClassroomTopFive(
      student.classroomId,
      classroomRankPeriods.active,
      student.id,
    );
    const classroomRankRewards = await readUnclaimedClassroomRankRewards(
      student.classroomId,
      student.id,
    );
    const titles = await readWalkingTitles(student.id);
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
      dailyStepRewards,
      weeklyStepRewards,
      representativeSlime: representativeSlime
        ? {
            color: representativeSlime.color,
            growthStage: representativeSlime.growthStage as 1 | 2 | 3,
            equippedFloor: getEquippedSlimeFloor(representativeSlime.equippedItemKeys),
          } satisfies WalkingRepresentativeSlime
        : null,
      classroomTopFive,
      classroomRankRewards,
      classroomRankNextResetAt: classroomRankPeriods.nextResetAt.toISOString(),
      titles,
    });
  } catch (error) {
    console.error("[GET /api/student/walking]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
