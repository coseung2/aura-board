export type WalkingTitleStats = {
  maxDailySteps: number | bigint;
  maxWeeklySteps: number | bigint;
  maxMonthlySteps: number | bigint;
};

export const WALKING_TITLES = [
  {
    key: "monthly-300k",
    label: "국토대장정",
    imagePath: "/walking/titles/monthly-300k-pixel-512.png",
    earned: (row: WalkingTitleStats) => Number(row.maxMonthlySteps) >= 300_000,
  },
  {
    key: "weekly-75k",
    label: "위대한 행진",
    imagePath: "/walking/titles/weekly-75k-pixel-512.png",
    earned: (row: WalkingTitleStats) => Number(row.maxWeeklySteps) >= 75_000,
  },
  {
    key: "weekly-50k",
    label: "꾸준한 발걸음",
    imagePath: "/walking/titles/weekly-50k-pixel-512.png",
    earned: (row: WalkingTitleStats) => Number(row.maxWeeklySteps) >= 50_000,
  },
  {
    key: "daily-20k",
    label: "오늘의 질주",
    imagePath: "/walking/titles/daily-20k-pixel-512.png",
    earned: (row: WalkingTitleStats) => Number(row.maxDailySteps) >= 20_000,
  },
] as const;

export function walkingTitleForStats(stats: WalkingTitleStats) {
  const title = WALKING_TITLES.find((candidate) => candidate.earned(stats));
  return title
    ? { key: title.key, label: title.label, imagePath: title.imagePath }
    : null;
}
