import type { TitleProgress } from "./walking-titles";
import type { SlimeEffectKey } from "./pets/types";

export type ReadingTitleStats = {
  /** Total reading logs the student has written. */
  totalLogs: number | bigint;
  /** Longest run of consecutive KST days with at least one log. */
  maxStreakDays: number | bigint;
  /** Highest single-log reflection length in characters. */
  maxReflectionLength: number | bigint;
};

/**
 * Ordered best-first so the highest earned title becomes the representative one,
 * matching how walking titles are resolved.
 */
export const READING_TITLES = [
  {
    key: "logs-50",
    label: "독서왕",
    imagePath: "/reading/titles/logs-50-pixel-512.png",
    requirement: "독서 기록 50권",
    effectKey: "reading_reward" as SlimeEffectKey,
    buffBps: 400,
    earned: (row: ReadingTitleStats) => Number(row.totalLogs) >= 50,
  },
  {
    key: "streak-14",
    label: "매일읽기",
    imagePath: "/reading/titles/streak-14-pixel-512.png",
    requirement: "연속 독서 14일",
    effectKey: "reading_reward" as SlimeEffectKey,
    buffBps: 300,
    earned: (row: ReadingTitleStats) => Number(row.maxStreakDays) >= 14,
  },
  {
    key: "reflection-300",
    label: "훌륭한 비평가",
    imagePath: "/reading/titles/reflection-300-pixel-512.png",
    requirement: "감상문 300자",
    effectKey: "reading_reward" as SlimeEffectKey,
    buffBps: 200,
    earned: (row: ReadingTitleStats) => Number(row.maxReflectionLength) >= 300,
  },
  {
    key: "logs-5",
    label: "독서 새싹",
    imagePath: "/reading/titles/logs-5-pixel-512.png",
    requirement: "독서 기록 5권",
    effectKey: "reading_reward" as SlimeEffectKey,
    buffBps: 100,
    earned: (row: ReadingTitleStats) => Number(row.totalLogs) >= 5,
  },
] as const;

export function readingTitleForStats(stats: ReadingTitleStats) {
  const title = READING_TITLES.find((candidate) => candidate.earned(stats));
  return title
    ? { key: title.key, label: title.label, imagePath: title.imagePath }
    : null;
}

/** Every reading title with its earned and claimed state, best title first. */
export function readingTitleProgress(
  stats: ReadingTitleStats,
  claimedKeys: ReadonlySet<string> = new Set(),
): TitleProgress[] {
  return READING_TITLES.map((title) => ({
    key: title.key,
    label: title.label,
    imagePath: title.imagePath,
    requirement: title.requirement,
    effectKey: title.effectKey,
    buffBps: title.buffBps,
    earned: title.earned(stats),
    claimed: claimedKeys.has(title.key),
  }));
}
