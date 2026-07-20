import { describe, expect, it } from "vitest";

import {
  calculateSlimeGrowthSnapshot,
  formatSlimeGrowthRemaining,
  settleSlimeGrowth,
  settleSlimeGrowthWithSpeed,
  slimeGrowthProgressForElapsedSeconds,
  slimeGrowthStageForSeconds,
  SLIME_GROWTH_SECONDS_PER_DAY,
} from "./growth";

const at = (seconds: number) => new Date(seconds * 1000);

function state(overrides: Partial<Parameters<typeof settleSlimeGrowth>[0]> = {}) {
  return {
    stage: 1 as const,
    growthSeconds: 0,
    growthRemainderBps: 0,
    growthLastSettledAt: at(0),
    growthAppliedSpeedBps: 0,
    ...overrides,
  };
}

describe("slime wall-clock growth", () => {
  it("uses three monotonic stages and cumulative day thresholds", () => {
    expect(slimeGrowthStageForSeconds(10 * SLIME_GROWTH_SECONDS_PER_DAY - 1)).toBe(1);
    expect(slimeGrowthStageForSeconds(10 * SLIME_GROWTH_SECONDS_PER_DAY)).toBe(2);
    expect(slimeGrowthStageForSeconds(25 * SLIME_GROWTH_SECONDS_PER_DAY)).toBe(3);

    const regressed = settleSlimeGrowth(
      state({ stage: 3, growthSeconds: 1 }),
      at(1),
    );
    expect(regressed.stage).toBe(3);
  });

  it("treats 100 bps as one percent and settles integer seconds", () => {
    expect(slimeGrowthProgressForElapsedSeconds(100, 100)).toBe(101);
    expect(slimeGrowthProgressForElapsedSeconds(1, 200)).toBe(1);

    const settled = settleSlimeGrowth(state({ growthAppliedSpeedBps: 200 }), at(100));
    expect(settled.growthSeconds).toBe(102);
    expect(settled.growthRemainderBps).toBe(0);
    expect(settled.growthLastSettledAt).toEqual(at(100));
  });

  it("carries fractional effective seconds across frequent settlements", () => {
    let current = state({ growthAppliedSpeedBps: 100 });
    for (let second = 1; second <= 100; second += 1) {
      current = settleSlimeGrowth(current, at(second));
    }
    expect(current.growthSeconds).toBe(101);
    expect(current.growthRemainderBps).toBe(0);
  });

  it("settles under the old rate before carrying a newly equipped rate", () => {
    const changed = settleSlimeGrowthWithSpeed(
      state({ growthAppliedSpeedBps: 1_000 }),
      0,
      at(100),
    );
    expect(changed.growthSeconds).toBe(110);
    expect(changed.growthAppliedSpeedBps).toBe(0);
  });

  it("projects remaining time in seconds and formats at minute precision", () => {
    const snapshot = calculateSlimeGrowthSnapshot(
      state({ growthSeconds: 10 * SLIME_GROWTH_SECONDS_PER_DAY - 90 }),
      at(0),
    );
    expect(snapshot.stage).toBe(1);
    expect(snapshot.remainingSeconds).toBe(90);
    expect(snapshot.remainingMinutes).toBe(2);
    expect(formatSlimeGrowthRemaining(90)).toBe("남은 시간 약 2분");
    expect(formatSlimeGrowthRemaining(0)).toBe("최종 성장 완료");
  });
});
