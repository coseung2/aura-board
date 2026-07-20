import { describe, expect, it } from "vitest";
import { getSlimeDefinition } from "./pets/catalog";

import {
  canRewardWalkingDay,
  DEFAULT_REWARD_POLICY,
  getKstRewardBounds,
  getKstWeekStartDay,
  isMeaningfulRewardComment,
  normalizeRewardComment,
  rewardAmountWithBuff,
  walkingRewardUnits,
  walkingUnitSourceRef,
  walkingWeeklyTierSourceRef,
  walkingWeeklyGoalSourceRef,
  getWalkingWeeklyRewardTiers,
  getKstRewardWeekRange,
  WALKING_WEEKLY_REWARD_TIERS,
  WALKING_WEEKLY_REWARD_SOURCE_TYPE,
} from "./reward-policy";

describe("area reward policy", () => {
  it("uses the contracted default economy", () => {
    expect(DEFAULT_REWARD_POLICY).toMatchObject({
      readingRewardPerPoint: 5,
      readingMinScoreForPayout: 5,
      readingDailyRewardCap: 10,
      readingWeeklyRewardCap: 20,
      commentRewardAmount: 5,
      commentDailyRewardCap: 10,
      commentWeeklyRewardCap: 30,
      assignmentRewardAmount: 20,
      assignmentDailyRewardCap: 0,
      assignmentWeeklyRewardCap: 0,
      walkingRewardStepThreshold: 5_000,
      walkingRewardAmount: 10,
      walkingDailyUnitCap: 4,
      walkingWeeklyRewardDayCap: 5,
      walkingWeeklyTier1Steps: 25_000,
      walkingWeeklyTier1Amount: 20,
      walkingWeeklyTier2Steps: 50_000,
      walkingWeeklyTier2Amount: 40,
      walkingWeeklyTier3Steps: 75_000,
      walkingWeeklyTier3Amount: 100,
      rewardBuffCapBps: 2_000,
    });
  });

  it("maps reward areas to the contracted slime colors", () => {
    expect(getSlimeDefinition("green")?.effectKey).toBe("reading_reward");
    expect(getSlimeDefinition("yellow")?.effectKey).toBe("walking_reward");
    expect(getSlimeDefinition("purple")?.effectKey).toBe("assignment_reward");
    expect(getSlimeDefinition("red")?.effectKey).toBe("comment_reward");
  });

  it.each([
    [4_999, 0],
    [5_000, 1],
    [9_999, 1],
    [10_000, 2],
    [20_000, 4],
    [100_000, 4],
  ])("converts %i steps into %i bounded daily units", (steps, units) => {
    expect(walkingRewardUnits(steps)).toBe(units);
  });

  it("floors won and clamps a reward buff to 20 percent", () => {
    expect(rewardAmountWithBuff(5, 1_999)).toBe(5);
    expect(rewardAmountWithBuff(101, 1_999)).toBe(121);
    expect(rewardAmountWithBuff(101, 9_999)).toBe(121);
  });

  it("normalizes comments and rejects punctuation-only or too-short text", () => {
    expect(normalizeRewardComment("  좋은\n 책 이에요  ")).toBe("좋은 책 이에요");
    expect(isMeaningfulRewardComment("!!!!", 4)).toBe(false);
    expect(isMeaningfulRewardComment("좋은 책이에요!", 4)).toBe(true);
  });

  it("uses KST midnight and Monday week boundaries", () => {
    const sunday = getKstRewardBounds(new Date("2026-07-19T14:59:59.999Z"));
    const monday = getKstRewardBounds(new Date("2026-07-19T15:00:00.000Z"));
    expect(sunday.dayStart.toISOString()).toBe("2026-07-18T15:00:00.000Z");
    expect(sunday.weekStart.toISOString()).toBe("2026-07-12T15:00:00.000Z");
    expect(monday.dayStart.toISOString()).toBe("2026-07-19T15:00:00.000Z");
    expect(monday.weekStart.toISOString()).toBe("2026-07-19T15:00:00.000Z");
    expect(getKstWeekStartDay("2026-07-26")).toBe("2026-07-20");
  });

  it("namespaces walking units, tiers, and legacy goal retries", () => {
    expect(walkingUnitSourceRef("student-1", "2026-07-20", 2)).toBe(
      "student-1:2026-07-20:unit:2",
    );
    expect(walkingWeeklyGoalSourceRef("student-1", "2026-07-20")).toBe(
      "student-1:2026-07-20:weekly-goal",
    );
    expect(walkingWeeklyTierSourceRef("student-1", "2026-07-20", "tier2")).toBe(
      "student-1:2026-07-20:weekly-tier:tier2",
    );
    expect(WALKING_WEEKLY_REWARD_SOURCE_TYPE).toBe("walking_weekly_reward");
  });

  it("uses independent weekly threshold payouts", () => {
    expect(WALKING_WEEKLY_REWARD_TIERS).toEqual([
      { key: "tier1", steps: 25_000, amount: 20 },
      { key: "tier2", steps: 50_000, amount: 40 },
      { key: "tier3", steps: 75_000, amount: 100 },
    ]);
    expect(getWalkingWeeklyRewardTiers()).toEqual([
      { key: "tier1", steps: 25_000, amount: 20 },
      { key: "tier2", steps: 50_000, amount: 40 },
      { key: "tier3", steps: 75_000, amount: 100 },
    ]);
  });

  it("uses a fixed KST Monday-to-next-Monday week at both boundaries", () => {
    expect(getKstRewardWeekRange(new Date("2026-07-19T14:59:59.999Z"))).toEqual({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-20",
    });
    expect(getKstRewardWeekRange(new Date("2026-07-19T15:00:00.000Z"))).toEqual({
      weekStart: "2026-07-20",
      weekEnd: "2026-07-27",
    });
  });

  it("allows five walking reward days per week and resyncs an existing day", () => {
    const days = new Set([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(canRewardWalkingDay(days, "2026-07-24")).toBe(true);
    expect(canRewardWalkingDay(days, "2026-07-25")).toBe(false);
  });
});
