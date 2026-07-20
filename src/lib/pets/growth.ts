/**
 * Pure wall-clock growth math for student slimes.
 *
 * `growthSeconds` stores effective elapsed time.  A speed of 100 bps is a
 * one-percent rate bonus, so one real second contributes 1.01 effective
 * seconds.  The service settles this value before changing the applied rate;
 * clients can use the snapshot helpers for a read-only projection.
 */

export type SlimeGrowthStage = 1 | 2 | 3;

export type SlimeGrowthState = {
  stage: SlimeGrowthStage;
  growthSeconds: number;
  /** Fractional effective seconds in 1/10,000-second units. */
  growthRemainderBps: number;
  growthLastSettledAt: Date;
  growthAppliedSpeedBps: number;
};

export type SlimeGrowthSnapshot = SlimeGrowthState & {
  nextStage: SlimeGrowthStage | null;
  remainingSeconds: number;
  remainingMinutes: number;
  /** Stable aliases for clients that call the persisted fields "progress". */
  growthProgressSeconds: number;
  lastSettledAt: Date;
  appliedSpeedBps: number;
};

export const SLIME_GROWTH_SECONDS_PER_DAY = 24 * 60 * 60;
export const SLIME_GROWTH_BPS_BASE = 10_000;

/** Cumulative effective seconds needed to enter each stage. */
export const SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS: Readonly<
  Record<SlimeGrowthStage, number>
> = {
  1: 0,
  2: 10 * SLIME_GROWTH_SECONDS_PER_DAY,
  3: 25 * SLIME_GROWTH_SECONDS_PER_DAY,
};

export const SLIME_GROWTH_FINAL_SECONDS =
  SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS[3];

function safeNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function safeRemainderBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(SLIME_GROWTH_BPS_BASE - 1, Math.trunc(value)));
}

export function normalizeSlimeGrowthSpeedBps(value: number): number {
  return safeNonNegativeInteger(value);
}

export function normalizeSlimeGrowthStage(value: number): SlimeGrowthStage {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

export function slimeGrowthStageForSeconds(seconds: number): SlimeGrowthStage {
  const safeSeconds = safeNonNegativeInteger(seconds);
  if (safeSeconds >= SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS[3]) return 3;
  if (safeSeconds >= SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS[2]) return 2;
  return 1;
}

/** 1%=100 bps.  Returned as a multiplier for one real second. */
export function slimeGrowthRateForBps(growthSpeedBps: number): number {
  return (
    SLIME_GROWTH_BPS_BASE + normalizeSlimeGrowthSpeedBps(growthSpeedBps)
  ) / SLIME_GROWTH_BPS_BASE;
}

/** Effective progress contributed by a number of real elapsed seconds. */
export function slimeGrowthProgressForElapsedSeconds(
  elapsedSeconds: number,
  growthSpeedBps: number,
): number {
  const safeElapsed = safeNonNegativeInteger(elapsedSeconds);
  const speed = normalizeSlimeGrowthSpeedBps(growthSpeedBps);
  // This standalone helper returns only whole seconds. The settlement helper
  // additionally carries the fractional remainder in growthRemainderBps.
  return Math.floor((safeElapsed * (SLIME_GROWTH_BPS_BASE + speed)) / SLIME_GROWTH_BPS_BASE);
}

function asDate(value: Date | number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function settlementNow(state: SlimeGrowthState, now: Date | number): Date {
  const requested = asDate(now);
  const previous = asDate(state.growthLastSettledAt);
  // Never move the settlement cursor backwards if a machine clock is adjusted
  // while a request is in flight.
  return requested.getTime() >= previous.getTime() ? requested : previous;
}

/**
 * Apply all wall-clock progress up to `now` using the persisted old speed.
 * Stage transitions only move forward and progress is capped at the final
 * threshold so repeated settlements remain idempotent.
 */
export function settleSlimeGrowth(
  state: SlimeGrowthState,
  now: Date | number = new Date(),
): SlimeGrowthState {
  const previous = asDate(state.growthLastSettledAt);
  const settledAt = settlementNow(state, now);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((settledAt.getTime() - previous.getTime()) / 1000),
  );
  const speed = normalizeSlimeGrowthSpeedBps(state.growthAppliedSpeedBps);
  const numerator =
    elapsedSeconds * (SLIME_GROWTH_BPS_BASE + speed) +
    safeRemainderBps(state.growthRemainderBps);
  const progressed = safeNonNegativeInteger(state.growthSeconds) + Math.floor(
    numerator / SLIME_GROWTH_BPS_BASE,
  );
  const growthSeconds = Math.min(SLIME_GROWTH_FINAL_SECONDS, progressed);
  const stage = Math.max(
    normalizeSlimeGrowthStage(state.stage),
    slimeGrowthStageForSeconds(growthSeconds),
  ) as SlimeGrowthStage;

  return {
    stage,
    growthSeconds,
    growthRemainderBps:
      growthSeconds >= SLIME_GROWTH_FINAL_SECONDS
        ? 0
        : numerator % SLIME_GROWTH_BPS_BASE,
    growthLastSettledAt: settledAt,
    growthAppliedSpeedBps: speed,
  };
}

/** Settle first, then atomically carry the newly selected applied rate. */
export function settleSlimeGrowthWithSpeed(
  state: SlimeGrowthState,
  growthSpeedBps: number,
  now: Date | number = new Date(),
): SlimeGrowthState {
  return {
    ...settleSlimeGrowth(state, now),
    growthAppliedSpeedBps: normalizeSlimeGrowthSpeedBps(growthSpeedBps),
  };
}

/** Project the current snapshot without mutating or persisting state. */
export function calculateSlimeGrowthSnapshot(
  state: SlimeGrowthState,
  now: Date | number = new Date(),
): SlimeGrowthSnapshot {
  const settled = settleSlimeGrowth(state, now);
  const nextStage = settled.stage < 3
    ? ((settled.stage + 1) as SlimeGrowthStage)
    : null;
  const target = nextStage
    ? SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS[nextStage]
    : SLIME_GROWTH_FINAL_SECONDS;
  const remainingSeconds = Math.max(0, target - settled.growthSeconds);

  return {
    ...settled,
    nextStage,
    remainingSeconds,
    remainingMinutes: Math.ceil(remainingSeconds / 60),
    growthProgressSeconds: settled.growthSeconds,
    lastSettledAt: settled.growthLastSettledAt,
    appliedSpeedBps: settled.growthAppliedSpeedBps,
  };
}

/** Display no finer than one-minute precision. */
export function formatSlimeGrowthRemaining(remainingSeconds: number): string {
  const safeSeconds = safeNonNegativeInteger(remainingSeconds);
  if (safeSeconds === 0) return "최종 성장 완료";

  const minutes = Math.max(1, Math.ceil(safeSeconds / 60));
  if (minutes < 60) return `남은 시간 약 ${minutes}분`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `남은 시간 약 ${hours}시간`;
  return `남은 시간 약 ${Math.ceil(hours / 24)}일`;
}

// Compatibility aliases for callers of the short-lived work-count draft.
// They now intentionally operate on effective wall-clock seconds.
export const SLIME_GROWTH_STAGE_THRESHOLDS =
  SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS;
export function slimeGrowthStageForWork(seconds: number): SlimeGrowthStage {
  return slimeGrowthStageForSeconds(seconds);
}
