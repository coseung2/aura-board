export const REWARD_SOURCE_TYPES = {
  reading: "reading_reward",
  walking: "walking_reward",
  assignment: "assignment_reward",
  comment: "comment_reward",
} as const;

export type RewardArea = keyof typeof REWARD_SOURCE_TYPES;
export type RewardSourceType = (typeof REWARD_SOURCE_TYPES)[RewardArea];
export const WALKING_WEEKLY_REWARD_SOURCE_TYPE = "walking_weekly_reward" as const;

/** Weekly walking rewards are independent threshold payouts. */
export const WALKING_WEEKLY_REWARD_TIERS = [
  { key: "tier1", steps: 25_000, amount: 20 },
  { key: "tier2", steps: 50_000, amount: 40 },
  { key: "tier3", steps: 75_000, amount: 100 },
] as const;

export type WalkingWeeklyRewardTierKey = (typeof WALKING_WEEKLY_REWARD_TIERS)[number]["key"];

export type WalkingWeeklyRewardTier = {
  key: WalkingWeeklyRewardTierKey;
  steps: number;
  amount: number;
};

export const REWARD_EFFECT_BY_AREA = {
  reading: "reading_reward",
  walking: "walking_reward",
  assignment: "assignment_reward",
  comment: "comment_reward",
} as const;

export const DEFAULT_REWARD_POLICY = {
  readingRewardPerPoint: 5,
  readingMinScoreForPayout: 5,
  readingDailyRewardCap: 10,
  readingWeeklyRewardCap: 20,
  commentRewardAmount: 5,
  commentDailyRewardCap: 10,
  commentWeeklyRewardCap: 30,
  commentMinMeaningfulLength: 4,
  walkingRewardStepThreshold: 5_000,
  walkingRewardAmount: 10,
  walkingDailyUnitCap: 4,
  walkingWeeklyRewardDayCap: 5,
  walkingWeeklyTier1Steps: WALKING_WEEKLY_REWARD_TIERS[0].steps,
  walkingWeeklyTier1Amount: WALKING_WEEKLY_REWARD_TIERS[0].amount,
  walkingWeeklyTier2Steps: WALKING_WEEKLY_REWARD_TIERS[1].steps,
  walkingWeeklyTier2Amount: WALKING_WEEKLY_REWARD_TIERS[1].amount,
  walkingWeeklyTier3Steps: WALKING_WEEKLY_REWARD_TIERS[2].steps,
  walkingWeeklyTier3Amount: WALKING_WEEKLY_REWARD_TIERS[2].amount,
  assignmentRewardAmount: 20,
  // Zero means unlimited. Assignment rewards are paid for every valid
  // submission; reading/comment zero values continue to disable payouts.
  assignmentDailyRewardCap: 0,
  assignmentWeeklyRewardCap: 0,
  rewardBuffCapBps: 2_000,
} as const;

export type RewardPolicy = { -readonly [K in keyof typeof DEFAULT_REWARD_POLICY]: number };

/** Resolve the configured threshold payouts from the classroom policy. */
export function getWalkingWeeklyRewardTiers(
  policy: Pick<RewardPolicy,
    | "walkingWeeklyTier1Steps"
    | "walkingWeeklyTier1Amount"
    | "walkingWeeklyTier2Steps"
    | "walkingWeeklyTier2Amount"
    | "walkingWeeklyTier3Steps"
    | "walkingWeeklyTier3Amount"
  > = DEFAULT_REWARD_POLICY,
): WalkingWeeklyRewardTier[] {
  const configured = [
    {
      key: WALKING_WEEKLY_REWARD_TIERS[0].key,
      steps: policy.walkingWeeklyTier1Steps,
      amount: policy.walkingWeeklyTier1Amount,
    },
    {
      key: WALKING_WEEKLY_REWARD_TIERS[1].key,
      steps: policy.walkingWeeklyTier2Steps,
      amount: policy.walkingWeeklyTier2Amount,
    },
    {
      key: WALKING_WEEKLY_REWARD_TIERS[2].key,
      steps: policy.walkingWeeklyTier3Steps,
      amount: policy.walkingWeeklyTier3Amount,
    },
  ];
  return configured;
}

/** Return the current KST Monday-to-next-Monday half-open week. */
export function getKstRewardWeekRange(at = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  const bounds = getKstRewardBounds(at);
  return {
    weekStart: toKstDayKey(bounds.weekStart),
    weekEnd: toKstDayKey(bounds.weekEnd),
  };
}

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

/** Stable source key for one independent weekly tier payout. */
export function walkingWeeklyTierSourceRef(
  studentId: string,
  weekStartDay: string,
  tier: WalkingWeeklyRewardTierKey | number,
): string {
  const key = typeof tier === "number" ? `tier${tier}` : tier;
  return `${studentId}:${weekStartDay}:weekly-tier:${key}`;
}

/** Legacy source key used by the pre-tier 25,000-step payout. */
export function walkingWeeklyGoalSourceRef(studentId: string, weekStartDay: string): string {
  return `${studentId}:${weekStartDay}:weekly-goal`;
}
