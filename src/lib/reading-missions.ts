export type ReadingMissionKey =
  | "weekly_books"
  | "consecutive_days"
  | "reflection_chars";

export type ReadingMission = {
  key: ReadingMissionKey;
  title: string;
  description: string;
  target: number;
  progress: number;
  unit: string;
  completed: boolean;
  amount: number;
  claimed: boolean;
  claimable: boolean;
  /** Independently claimable 10-won progress milestones. */
  steps?: ReadingMissionStep[];
  achievedStepCount?: number;
  claimedStepCount?: number;
  claimableStepCount?: number;
  claimedAmount?: number;
  claimableAmount?: number;
};

export type ReadingMissionStep = {
  /** Stable, one-based identity used by the claim endpoint/source reference. */
  unit: number;
  /** Mission progress required for this step (books, days, or characters). */
  target: number;
  amount: 10;
  achieved: boolean;
  claimed: boolean;
  claimable: boolean;
};

export type ReadingMissionStepClaim = {
  missionKey: ReadingMissionKey;
  unit: number;
};

export type ReadingMissionLog = {
  createdAt: string | Date;
  reflection: string;
  missionCounted: boolean;
};

export type BuildReadingMissionsInput = {
  studentId: string;
  weekStart: string;
  weekEnd: string;
  logs: readonly ReadingMissionLog[];
  /** Mission keys already paid out this week. */
  claimedKeys?: readonly ReadingMissionKey[];
  /** Independently paid milestone units for the current week. */
  claimedSteps?: readonly ReadingMissionStepClaim[];
  /** @deprecated Alias for a legacy all-missions payout. */
  claimed?: boolean;
  /**
   * Legacy all-three payout already claimed for this week.
   * Treated as every mission claimed for display/idempotency.
   */
  legacyAllClaimed?: boolean;
};

/** Every achieved reading milestone pays the same fixed amount. */
export const READING_MISSION_STEP_REWARD_AMOUNT = 10 as const;

/**
 * @deprecated Mission totals vary with the deterministic weekly target.
 * Use each mission's `amount` or `READING_MISSION_STEP_REWARD_AMOUNT`.
 */
export const READING_MISSION_REWARD_AMOUNTS = {
  weekly_books: READING_MISSION_STEP_REWARD_AMOUNT,
  consecutive_days: READING_MISSION_STEP_REWARD_AMOUNT,
  reflection_chars: READING_MISSION_STEP_REWARD_AMOUNT,
} as const satisfies Record<ReadingMissionKey, number>;

/** @deprecated The actual weekly total is target-dependent. */
export const READING_WEEKLY_MISSION_REWARD_AMOUNT = 50 as const;

export const READING_MISSION_KEYS = [
  "weekly_books",
  "consecutive_days",
  "reflection_chars",
] as const satisfies readonly ReadingMissionKey[];

export type ReadingWeeklyMissionReward = {
  weekStart: string;
  weekEnd: string;
  /** Sum of all mission reward amounts for the week. */
  amount: number;
  /** Sum of claimable or claimed mission rewards still relevant this week. */
  completedCount: number;
  totalCount: number;
  /** True when every mission is complete (not necessarily claimed). */
  achieved: boolean;
  /** True when every mission reward has been claimed. */
  claimed: boolean;
  /** True when at least one mission reward can be claimed now. */
  claimable: boolean;
  totalStepCount?: number;
  achievedStepCount?: number;
  claimedStepCount?: number;
  claimableStepCount?: number;
  achievedAmount?: number;
  claimedAmount?: number;
  claimableAmount?: number;
  missions: ReadingMission[];
};

export type BuildReadingWeeklyMissionRewardInput = BuildReadingMissionsInput;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const graphemeSegmenter = new Intl.Segmenter("ko", {
  granularity: "grapheme",
});

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function nextRandom(seed: number): number {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

function targetFor(
  studentId: string,
  weekStart: string,
  key: ReadingMissionKey,
  minimum: number,
  maximum: number,
): number {
  const seed = hashSeed(`${studentId}\u0000${weekStart}\u0000${key}`);
  return minimum + (nextRandom(seed) % (maximum - minimum + 1));
}

function steppedTargetFor(
  studentId: string,
  weekStart: string,
  key: ReadingMissionKey,
  minimum: number,
  maximum: number,
  increment: number,
): number {
  const unitMinimum = Math.ceil(minimum / increment);
  const unitMaximum = Math.floor(maximum / increment);
  return targetFor(studentId, weekStart, key, unitMinimum, unitMaximum) * increment;
}

function parseKstBoundary(date: string): number {
  return new Date(`${date}T00:00:00+09:00`).getTime();
}

function kstDateKey(timestamp: number): string {
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function longestConsecutiveReadingDays(
  logs: readonly ReadingMissionLog[],
  weekStart: string,
  weekEnd: string,
): number {
  const start = parseKstBoundary(weekStart);
  const end = parseKstBoundary(weekEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return 0;

  const dates = new Set<string>();
  for (const log of logs) {
    if (!log.missionCounted) continue;
    const timestamp = new Date(log.createdAt).getTime();
    if (Number.isFinite(timestamp) && timestamp >= start && timestamp < end) {
      dates.add(kstDateKey(timestamp));
    }
  }

  const orderedDays = [...dates]
    .map((date) => Date.parse(`${date}T00:00:00Z`))
    .sort((left, right) => left - right);

  let longest = 0;
  let current = 0;
  let previous: number | undefined;
  for (const day of orderedDays) {
    current = previous !== undefined && day - previous === DAY_MS ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

function countGraphemes(value: string): number {
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(value)) count += 1;
  return count;
}

function claimedKeySet(input: BuildReadingMissionsInput): Set<ReadingMissionKey> {
  const keys = new Set<ReadingMissionKey>();
  if (input.legacyAllClaimed || input.claimed) {
    for (const key of READING_MISSION_KEYS) keys.add(key);
  }
  for (const key of input.claimedKeys ?? []) {
    if ((READING_MISSION_KEYS as readonly string[]).includes(key)) {
      keys.add(key as ReadingMissionKey);
    }
  }
  return keys;
}

function claimedStepSet(input: BuildReadingMissionsInput): Set<string> {
  const steps = new Set<string>();
  for (const claim of input.claimedSteps ?? []) {
    if (
      (READING_MISSION_KEYS as readonly string[]).includes(claim.missionKey) &&
      Number.isSafeInteger(claim.unit) &&
      claim.unit > 0
    ) {
      steps.add(`${claim.missionKey}:${claim.unit}`);
    }
  }
  return steps;
}

export function readingMissionStepSourceRef(
  studentId: string,
  weekStart: string,
  missionKey: ReadingMissionKey,
  unit: number,
): string {
  if (!Number.isSafeInteger(unit) || unit < 1) {
    throw new RangeError("invalid_reading_mission_unit");
  }
  return `${studentId}:${weekStart}:reading-weekly-mission:${missionKey}:unit:${unit}`;
}

export function parseReadingMissionStepSourceRef(
  sourceRef: string,
  studentId: string,
  weekStart: string,
): ReadingMissionStepClaim | null {
  const prefix = `${studentId}:${weekStart}:reading-weekly-mission:`;
  if (!sourceRef.startsWith(prefix)) return null;
  const match = sourceRef.slice(prefix.length).match(
    /^(weekly_books|consecutive_days|reflection_chars):unit:([1-9]\d*)$/,
  );
  if (!match) return null;
  const unit = Number(match[2]);
  if (!Number.isSafeInteger(unit)) return null;
  return { missionKey: match[1] as ReadingMissionKey, unit };
}

export function buildReadingMissions({
  studentId,
  weekStart,
  weekEnd,
  logs,
  claimedKeys,
  claimedSteps,
  claimed: legacyClaimed,
  legacyAllClaimed,
}: BuildReadingMissionsInput): ReadingMission[] {
  const booksTarget = targetFor(studentId, weekStart, "weekly_books", 5, 7);
  const daysTarget = targetFor(studentId, weekStart, "consecutive_days", 3, 5);
  const charsTarget = steppedTargetFor(
    studentId,
    weekStart,
    "reflection_chars",
    600,
    1_200,
    200,
  );
  const input = {
    studentId,
    weekStart,
    weekEnd,
    logs,
    claimedKeys,
    claimedSteps,
    claimed: legacyClaimed,
    legacyAllClaimed,
  };
  const claimed = claimedKeySet(input);
  const claimedUnits = claimedStepSet(input);

  const approvedLogs = logs.filter((log) => log.missionCounted);
  const booksProgress = approvedLogs.length;
  const daysProgress = longestConsecutiveReadingDays(logs, weekStart, weekEnd);
  const charsProgress = approvedLogs.reduce(
    (total, log) => total + countGraphemes(log.reflection),
    0,
  );

  const definitions: Array<{
    key: ReadingMissionKey;
    title: string;
    description: string;
    target: number;
    progress: number;
    unit: string;
  }> = [
    {
      key: "weekly_books",
      title: "읽은 책",
      description: `이번 주에 책 ${booksTarget}권을 읽어 보세요.`,
      target: booksTarget,
      progress: booksProgress,
      unit: "권",
    },
    {
      key: "consecutive_days",
      title: "연속 독서일",
      description: `${daysTarget}일 연속으로 독서 기록을 남겨 보세요.`,
      target: daysTarget,
      progress: daysProgress,
      unit: "일",
    },
    {
      key: "reflection_chars",
      title: "감상문 글자수",
      description: `독서 감상문을 누적 ${charsTarget}자 작성해 보세요.`,
      target: charsTarget,
      progress: charsProgress,
      unit: "자",
    },
  ];

  return definitions.map((definition) => {
    const completed = definition.progress >= definition.target;
    const stepSize = definition.key === "reflection_chars" ? 200 : 1;
    const stepCount = Math.floor(definition.target / stepSize);
    const legacyMissionClaimed = claimed.has(definition.key);
    const steps: ReadingMissionStep[] = Array.from(
      { length: stepCount },
      (_, index) => {
        const unit = index + 1;
        const target = unit * stepSize;
        const achieved = definition.progress >= target;
        const stepClaimed =
          legacyMissionClaimed || claimedUnits.has(`${definition.key}:${unit}`);
        return {
          unit,
          target,
          amount: READING_MISSION_STEP_REWARD_AMOUNT,
          achieved,
          claimed: stepClaimed,
          claimable: achieved && !stepClaimed,
        };
      },
    );
    const achievedStepCount = steps.filter((step) => step.achieved).length;
    const claimedStepCount = steps.filter((step) => step.claimed).length;
    const claimableStepCount = steps.filter((step) => step.claimable).length;
    return {
      ...definition,
      completed,
      amount: steps.length * READING_MISSION_STEP_REWARD_AMOUNT,
      claimed: steps.length > 0 && claimedStepCount === steps.length,
      claimable: claimableStepCount > 0,
      steps,
      achievedStepCount,
      claimedStepCount,
      claimableStepCount,
      claimedAmount: claimedStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
      claimableAmount: claimableStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
    };
  });
}

/** Package weekly reading missions with independent per-mission rewards. */
export function buildReadingWeeklyMissionReward(
  input: BuildReadingWeeklyMissionRewardInput,
): ReadingWeeklyMissionReward {
  const missions = buildReadingMissions(input);
  const completedCount = missions.filter((mission) => mission.completed).length;
  const totalCount = missions.length;
  const achieved = completedCount >= totalCount && totalCount > 0;
  const claimed = missions.length > 0 && missions.every((mission) => mission.claimed);
  const claimable = missions.some((mission) => mission.claimable);
  const amount = missions.reduce((sum, mission) => sum + mission.amount, 0);
  const totalStepCount = missions.reduce(
    (sum, mission) => sum + (mission.steps?.length ?? 0),
    0,
  );
  const achievedStepCount = missions.reduce(
    (sum, mission) => sum + (mission.achievedStepCount ?? 0),
    0,
  );
  const claimedStepCount = missions.reduce(
    (sum, mission) => sum + (mission.claimedStepCount ?? 0),
    0,
  );
  const claimableStepCount = missions.reduce(
    (sum, mission) => sum + (mission.claimableStepCount ?? 0),
    0,
  );
  const achievedAmount = achievedStepCount * READING_MISSION_STEP_REWARD_AMOUNT;
  const claimedAmount = claimedStepCount * READING_MISSION_STEP_REWARD_AMOUNT;
  const claimableAmount = claimableStepCount * READING_MISSION_STEP_REWARD_AMOUNT;
  return {
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    amount,
    completedCount,
    totalCount,
    achieved,
    claimed,
    claimable,
    totalStepCount,
    achievedStepCount,
    claimedStepCount,
    claimableStepCount,
    achievedAmount,
    claimedAmount,
    claimableAmount,
    missions,
  };
}
