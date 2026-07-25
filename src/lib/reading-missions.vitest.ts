import { describe, expect, it } from "vitest";

import {
  buildReadingMissions,
  buildReadingWeeklyMissionReward,
  parseReadingMissionStepSourceRef,
  readingMissionStepSourceRef,
  type BuildReadingMissionsInput,
} from "./reading-missions";

const BASE_INPUT: BuildReadingMissionsInput = {
  studentId: "student-a",
  weekStart: "2026-07-20",
  weekEnd: "2026-07-27",
  logs: [],
};

function mission(
  input: BuildReadingMissionsInput,
  key: "weekly_books" | "consecutive_days" | "reflection_chars",
) {
  const result = buildReadingMissions(input).find((item) => item.key === key);
  if (!result) throw new Error(`Missing mission: ${key}`);
  return result;
}

describe("buildReadingMissions", () => {
  it("returns exactly three ordered missions with targets in their ranges", () => {
    for (let index = 0; index < 100; index += 1) {
      const result = buildReadingMissions({
        ...BASE_INPUT,
        studentId: `student-${index}`,
        weekStart: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
      });

      expect(result.map((item) => item.key)).toEqual([
        "weekly_books",
        "consecutive_days",
        "reflection_chars",
      ]);
      expect(result[0].target).toBeGreaterThanOrEqual(5);
      expect(result[0].target).toBeLessThanOrEqual(7);
      expect(result[1].target).toBeGreaterThanOrEqual(3);
      expect(result[1].target).toBeLessThanOrEqual(5);
      expect(result[2].target).toBeGreaterThanOrEqual(600);
      expect(result[2].target).toBeLessThanOrEqual(1_200);
      expect(result[2].target % 200).toBe(0);
      for (const item of result) {
        expect(Number.isInteger(item.target)).toBe(true);
        expect(item.description).toContain(String(item.target));
      }
    }
  });

  it("uses the requested display titles and exposes 10-won unit steps", () => {
    const result = buildReadingMissions(BASE_INPUT);
    expect(result.map((item) => item.title)).toEqual([
      "읽은 책",
      "연속 독서일",
      "감상문 글자수",
    ]);
    expect(result[0].steps!.map((step) => step.target)).toEqual(
      Array.from({ length: result[0].target }, (_, index) => index + 1),
    );
    expect(result[1].steps!.map((step) => step.target)).toEqual(
      Array.from({ length: result[1].target }, (_, index) => index + 1),
    );
    expect(result[2].steps!.map((step) => step.target)).toEqual(
      Array.from({ length: result[2].target / 200 }, (_, index) => (index + 1) * 200),
    );
    expect(result.flatMap((item) => item.steps ?? []).every((step) => step.amount === 10)).toBe(true);
  });

  it("is deterministic while varying targets by student and week", () => {
    const first = buildReadingMissions(BASE_INPUT);

    expect(buildReadingMissions(BASE_INPUT)).toEqual(first);
    expect(
      buildReadingMissions({ ...BASE_INPUT, studentId: "student-b" }).map(
        (item) => item.target,
      ),
    ).not.toEqual(first.map((item) => item.target));
    expect(
      buildReadingMissions({
        ...BASE_INPUT,
        weekStart: "2026-07-27",
        weekEnd: "2026-08-03",
      }).map((item) => item.target),
    ).not.toEqual(first.map((item) => item.target));
  });

  it("counts logs as books and keeps actual progress above the target", () => {
    const logs = Array.from({ length: 9 }, (_, index) => ({
      createdAt: `2026-07-${String(20 + (index % 7)).padStart(2, "0")}T12:00:00+09:00`,
      reflection: "책",
    }));
    const books = mission({ ...BASE_INPUT, logs }, "weekly_books");

    expect(books.progress).toBe(9);
    expect(books.completed).toBe(true);
  });

  it("uses distinct KST reading dates within the half-open week", () => {
    const logs = [
      { createdAt: "2026-07-19T14:59:59.999Z", reflection: "before" },
      { createdAt: "2026-07-19T15:00:00.000Z", reflection: "day one" },
      { createdAt: "2026-07-20T14:30:00.000Z", reflection: "same KST day" },
      { createdAt: "2026-07-20T15:00:00.000Z", reflection: "day two" },
      { createdAt: "2026-07-21T15:00:00.000Z", reflection: "day three" },
      { createdAt: "2026-07-22T15:00:00.000Z", reflection: "day four" },
      { createdAt: "2026-07-26T14:59:59.999Z", reflection: "last instant" },
      { createdAt: "2026-07-26T15:00:00.000Z", reflection: "at end" },
      { createdAt: "not-a-date", reflection: "invalid" },
    ];

    expect(mission({ ...BASE_INPUT, logs }, "consecutive_days").progress).toBe(4);
  });

  it("counts Unicode grapheme clusters in Korean reflections", () => {
    const logs = [
      { createdAt: "2026-07-20T00:00:00+09:00", reflection: "한글" },
      { createdAt: "2026-07-21T00:00:00+09:00", reflection: "가\u0301" },
      { createdAt: "2026-07-22T00:00:00+09:00", reflection: "👨‍👩‍👧‍👦" },
      { createdAt: "2026-07-23T00:00:00+09:00", reflection: "" },
    ];

    expect(mission({ ...BASE_INPUT, logs }, "reflection_chars").progress).toBe(4);
  });

  it("returns zero progress and incomplete missions for no logs", () => {
    for (const item of buildReadingMissions(BASE_INPUT)) {
      expect(item.progress).toBe(0);
      expect(item.completed).toBe(false);
    }
  });
});

describe("buildReadingWeeklyMissionReward", () => {
  it("packages independent per-mission rewards and claim flags", () => {
    const incomplete = buildReadingWeeklyMissionReward(BASE_INPUT);
    expect(incomplete.amount).toBe(incomplete.totalStepCount! * 10);
    expect(incomplete.totalCount).toBe(3);
    expect(incomplete.completedCount).toBe(0);
    expect(incomplete.achieved).toBe(false);
    expect(incomplete.claimable).toBe(false);
    expect(incomplete.claimed).toBe(false);
    expect(incomplete.missions).toHaveLength(3);
    expect(incomplete.missions.every((mission) => mission.claimable === false)).toBe(true);
    expect(incomplete.missions.every(
      (mission) => mission.amount === (mission.steps?.length ?? 0) * 10,
    )).toBe(true);

    const books = incomplete.missions[0];
    const days = incomplete.missions[1];
    const chars = incomplete.missions[2];
    // One log per consecutive KST day, enough books, and enough graphemes overall.
    const completeLogs = Array.from({ length: Math.max(books.target, days.target) }, (_, index) => ({
      createdAt: `2026-07-${String(20 + index).padStart(2, "0")}T12:00:00+09:00`,
      reflection: "가".repeat(Math.ceil(chars.target / Math.max(books.target, days.target))),
    }));
    const achieved = buildReadingWeeklyMissionReward({
      ...BASE_INPUT,
      logs: completeLogs,
    });
    expect(achieved.missions.every((mission) => mission.completed)).toBe(true);
    expect(achieved.missions.every((mission) => mission.claimable)).toBe(true);
    expect(achieved.claimableStepCount).toBe(achieved.totalStepCount);
    expect(achieved.achieved).toBe(true);
    expect(achieved.claimable).toBe(true);
    expect(achieved.completedCount).toBe(3);

    const oneClaimed = buildReadingWeeklyMissionReward({
      ...BASE_INPUT,
      logs: completeLogs,
      claimedKeys: ["weekly_books"],
    });
    expect(oneClaimed.missions[0].claimed).toBe(true);
    expect(oneClaimed.missions[0].claimable).toBe(false);
    expect(oneClaimed.missions[1].claimable).toBe(true);
    expect(oneClaimed.claimable).toBe(true);
    expect(oneClaimed.claimed).toBe(false);

    const allClaimed = buildReadingWeeklyMissionReward({
      ...BASE_INPUT,
      logs: completeLogs,
      legacyAllClaimed: true,
    });
    expect(allClaimed.claimed).toBe(true);
    expect(allClaimed.claimable).toBe(false);
    expect(allClaimed.missions.every((mission) => mission.claimed)).toBe(true);
  });

  it("tracks one claimed unit without claiming the rest of its mission", () => {
    const books = mission(BASE_INPUT, "weekly_books");
    const logs = Array.from({ length: books.target }, (_, index) => ({
      createdAt: `2026-07-${String(20 + index).padStart(2, "0")}T12:00:00+09:00`,
      reflection: "감상",
    }));
    const reward = buildReadingWeeklyMissionReward({
      ...BASE_INPUT,
      logs,
      claimedSteps: [{ missionKey: "weekly_books", unit: 1 }],
    });
    const nextBooks = reward.missions[0];
    expect(nextBooks.steps?.[0]).toMatchObject({ claimed: true, claimable: false });
    expect(nextBooks.steps?.[1]).toMatchObject({ achieved: true, claimed: false, claimable: true });
    expect(nextBooks.claimed).toBe(false);
    expect(nextBooks.claimedAmount).toBe(10);
  });
});

describe("reading mission source references", () => {
  it("round-trips a stable mission/unit identity", () => {
    const ref = readingMissionStepSourceRef(
      "student-1",
      "2026-07-20",
      "reflection_chars",
      5,
    );
    expect(ref).toBe(
      "student-1:2026-07-20:reading-weekly-mission:reflection_chars:unit:5",
    );
    expect(parseReadingMissionStepSourceRef(ref, "student-1", "2026-07-20")).toEqual({
      missionKey: "reflection_chars",
      unit: 5,
    });
  });
});
