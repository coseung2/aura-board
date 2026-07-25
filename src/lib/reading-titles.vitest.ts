import { describe, expect, it } from "vitest";

import { READING_TITLES, readingTitleProgress } from "./reading-titles";

const stats = {
  totalLogs: 60,
  maxStreakDays: 20,
  maxReflectionLength: 400,
};

describe("reading titles", () => {
  it("ships only the titles that are live", () => {
    expect(READING_TITLES.map((title) => title.key)).toEqual([
      "logs-50",
      "streak-14",
      "reflection-300",
      "logs-5",
    ]);
  });

  it("marks claimed titles from the provided keys", () => {
    const progress = readingTitleProgress(stats, new Set(["logs-50"]));
    expect(progress.every((title) => title.earned)).toBe(true);
    expect(progress.filter((title) => title.claimed).map((title) => title.key)).toEqual([
      "logs-50",
    ]);
  });

  it("unlocks the entry title after five reading logs", () => {
    const before = readingTitleProgress({ ...stats, totalLogs: 4 });
    const reached = readingTitleProgress({ ...stats, totalLogs: 5 });

    expect(before.find((title) => title.key === "logs-5")?.earned).toBe(false);
    expect(reached.find((title) => title.key === "logs-5")?.earned).toBe(true);
  });
});
