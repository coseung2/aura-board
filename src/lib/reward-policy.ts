export const REWARD_SOURCE_TYPES = {
  reading: "reading_reward",
  walking: "walking_reward",
  assignment: "assignment_reward",
  comment: "comment_reward",
} as const;

export type RewardArea = keyof typeof REWARD_SOURCE_TYPES;
export type RewardSourceType = (typeof REWARD_SOURCE_TYPES)[RewardArea];
export const WALKING_WEEKLY_REWARD_SOURCE_TYPE = "walking_weekly_reward" as const;

export const REWARD_EFFECT_BY_AREA = {
  reading: "reading_reward",
  walking: "walking_reward",
  assignment: "assignment_reward",
  comment: "comment_reward",
} as const;

export const DEFAULT_REWARD_POLICY = {
  readingRewardPerPoint: 5,
  readingMinScoreForPayout: 5,
  readingDailyRewardCap: 1,
  readingWeeklyRewardCap: 2,
  commentRewardAmount: 5,
  commentDailyRewardCap: 1,
  commentWeeklyRewardCap: 2,
  commentMinMeaningfulLength: 4,
  walkingRewardStepThreshold: 5_000,
  walkingRewardAmount: 10,
  walkingDailyUnitCap: 2,
  walkingWeeklyRewardDayCap: 5,
  walkingWeeklyGoalSteps: 25_000,
  walkingWeeklyGoalAmount: 20,
  assignmentRewardAmount: 20,
  assignmentDailyRewardCap: 1,
  assignmentWeeklyRewardCap: 2,
  rewardBuffCapBps: 2_000,
} as const;

export type RewardPolicy = { -readonly [K in keyof typeof DEFAULT_REWARD_POLICY]: number };

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

function kstDateParts(at: Date): { year: number; month: number; day: number } {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function kstMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS);
}

/** Half-open KST day and Monday-based week ranges for transaction caps. */
export function getKstRewardBounds(at = new Date()) {
  const { year, month, day } = kstDateParts(at);
  const dayStart = kstMidnightUtc(year, month, day);
  const localWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (localWeekday + 6) % 7;
  const weekStart = new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
  return {
    dayStart,
    dayEnd: new Date(dayStart.getTime() + DAY_MS),
    weekStart,
    weekEnd: new Date(weekStart.getTime() + 7 * DAY_MS),
  };
}

export function toKstDayKey(at: Date): string {
  const { year, month, day } = kstDateParts(at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getKstWeekStartDay(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const local = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return toKstDayKey(new Date(local.getTime() - daysSinceMonday * DAY_MS - KST_OFFSET_MS));
}

export function rewardAmountWithBuff(baseAmount: number, buffBps: number, capBps = 2_000): number {
  if (!Number.isSafeInteger(baseAmount) || baseAmount <= 0) return 0;
  const boundedBuff = Math.min(
    Math.max(0, Math.trunc(Number.isFinite(buffBps) ? buffBps : 0)),
    Math.max(0, Math.trunc(Number.isFinite(capBps) ? capBps : 0)),
  );
  return Math.floor((baseAmount * (10_000 + boundedBuff)) / 10_000);
}

export function walkingRewardUnits(
  steps: number,
  threshold: number = DEFAULT_REWARD_POLICY.walkingRewardStepThreshold,
  dailyCap: number = DEFAULT_REWARD_POLICY.walkingDailyUnitCap,
): number {
  if (!Number.isSafeInteger(steps) || steps < 0 || threshold <= 0 || dailyCap <= 0) return 0;
  return Math.min(Math.floor(steps / threshold), Math.floor(dailyCap));
}

export function canRewardWalkingDay(
  rewardedDays: ReadonlySet<string>,
  dayKey: string,
  weeklyDayCap: number = DEFAULT_REWARD_POLICY.walkingWeeklyRewardDayCap,
): boolean {
  return rewardedDays.has(dayKey) || rewardedDays.size < Math.max(0, Math.floor(weeklyDayCap));
}

export function normalizeRewardComment(content: string): string {
  return content.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isMeaningfulRewardComment(content: string, minLength = 4): boolean {
  const normalized = normalizeRewardComment(content);
  const meaningful = normalized.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return meaningful >= Math.max(1, Math.floor(minLength));
}

export function walkingUnitSourceRef(studentId: string, day: string, unit: number): string {
  return `${studentId}:${day}:unit:${unit}`;
}

export function walkingWeeklyGoalSourceRef(studentId: string, weekStartDay: string): string {
  return `${studentId}:${weekStartDay}:weekly-goal`;
}
