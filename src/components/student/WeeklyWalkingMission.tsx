"use client";

import { useEffect, useMemo, useState } from "react";

export type WeeklyWalkingTierKey = "tier1" | "tier2" | "tier3";

export type WeeklyWalkingTier = {
  key: WeeklyWalkingTierKey;
  steps: number;
  amount: number;
  achieved: boolean;
  claimed: boolean;
};

export type WeeklyWalkingRewards = {
  weekStart: string;
  totalSteps: number;
  maxSteps: number;
  tiers: WeeklyWalkingTier[];
};

type Props = {
  initialRewards: WeeklyWalkingRewards;
};

type ClaimState = "claimable" | "pending" | "claimed" | "error" | "locked";

const numberFormatter = new Intl.NumberFormat("ko-KR");

function isTierKey(value: unknown): value is WeeklyWalkingTierKey {
  return value === "tier1" || value === "tier2" || value === "tier3";
}

function normalizeRewards(value: unknown): WeeklyWalkingRewards | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    weekStart?: unknown;
    totalSteps?: unknown;
    maxSteps?: unknown;
    tiers?: unknown;
  };
  if (!Array.isArray(raw.tiers)) return null;

  const tiers = raw.tiers.reduce<WeeklyWalkingTier[]>((result, tier) => {
    if (!tier || typeof tier !== "object") return result;
    const item = tier as Record<string, unknown>;
    if (
      !isTierKey(item.key) ||
      !Number.isFinite(Number(item.steps)) ||
      !Number.isFinite(Number(item.amount))
    ) {
      return result;
    }
    result.push({
      key: item.key,
      steps: Math.max(0, Math.round(Number(item.steps))),
      amount: Math.max(0, Math.round(Number(item.amount))),
      achieved: item.achieved === true,
      claimed: item.claimed === true,
    });
    return result;
  }, []);

  if (!tiers.length || typeof raw.weekStart !== "string" || !raw.weekStart) return null;
  const totalSteps = Number(raw.totalSteps);
  const maxSteps = Number(raw.maxSteps);
  return {
    weekStart: raw.weekStart,
    totalSteps: Number.isFinite(totalSteps) ? Math.max(0, Math.round(totalSteps)) : 0,
    maxSteps: Number.isFinite(maxSteps) ? Math.max(1, Math.round(maxSteps)) : 1,
    tiers,
  };
}

function claimErrorMessage(error: unknown) {
  if (error === "reward_not_achieved") return "걸음 목표를 먼저 달성해 주세요.";
  if (error === "unauthorized") return "로그인이 필요해요. 다시 로그인해 주세요.";
  return "보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function WeeklyWalkingMission({ initialRewards }: Props) {
  const [rewards, setRewards] = useState(initialRewards);
  const [pendingTierKey, setPendingTierKey] = useState<WeeklyWalkingTierKey | null>(null);
  const [errors, setErrors] = useState<Partial<Record<WeeklyWalkingTierKey, string>>>({});

  useEffect(() => {
    let cancelled = false;
    async function refreshRewards() {
      try {
        const response = await fetch("/api/student/walking", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { weeklyStepRewards?: unknown };
        const nextRewards = normalizeRewards(payload.weeklyStepRewards);
        if (!cancelled && nextRewards) {
          setRewards((previous) => {
            if (previous.weekStart !== nextRewards.weekStart) return nextRewards;
            const previousClaimed = new Set(
              previous.tiers.filter((tier) => tier.claimed).map((tier) => tier.key),
            );
            return {
              ...nextRewards,
              tiers: nextRewards.tiers.map((tier) => ({
                ...tier,
                claimed: tier.claimed || previousClaimed.has(tier.key),
              })),
            };
          });
          setErrors((previous) => {
            const next = { ...previous };
            nextRewards.tiers.forEach((tier) => {
              if (tier.claimed) delete next[tier.key];
            });
            return next;
          });
        }
      } catch {
        // The server-rendered values remain usable when the reconciliation read fails.
      }
    }

    void refreshRewards();
    return () => {
      cancelled = true;
    };
  }, []);

  const graphMaxSteps = useMemo(
    () =>
      Math.max(
        1,
        rewards.maxSteps,
        rewards.totalSteps,
        ...rewards.tiers.map((tier) => tier.steps),
      ),
    [rewards],
  );
  const progress = Math.min(100, Math.round((rewards.totalSteps / graphMaxSteps) * 100));
  const rewardTotal = rewards.tiers.reduce((sum, tier) => sum + tier.amount, 0);
  const claimedTotal = rewards.tiers
    .filter((tier) => tier.claimed)
    .reduce((sum, tier) => sum + tier.amount, 0);

  async function claimTier(tierKey: WeeklyWalkingTierKey) {
    if (pendingTierKey) return;
    const tier = rewards.tiers.find((candidate) => candidate.key === tierKey);
    if (!tier || !tier.achieved || tier.claimed) return;

    setPendingTierKey(tierKey);
    setErrors((previous) => ({ ...previous, [tierKey]: undefined }));
    try {
      const response = await fetch("/api/student/walking/rewards/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tierKey }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: unknown; tier?: unknown }
        | null;

      if (!response.ok) {
        setErrors((previous) => ({
          ...previous,
          [tierKey]: claimErrorMessage(payload?.error),
        }));
        return;
      }

      const claimedTier = normalizeRewards({
        ...rewards,
        tiers: [payload?.tier],
      })?.tiers[0];
      setRewards((previous) => ({
        ...previous,
        tiers: previous.tiers.map((candidate) =>
          candidate.key === tierKey
            ? {
                ...candidate,
                ...(claimedTier ?? {}),
                achieved: true,
                claimed: true,
              }
            : candidate,
        ),
      }));
    } catch {
      setErrors((previous) => ({
        ...previous,
        [tierKey]: claimErrorMessage(null),
      }));
    } finally {
      setPendingTierKey(null);
    }
  }

  return (
    <section
      className="classroom-dashboard-panel student-walking-rewards"
      aria-labelledby="walking-rewards-title"
    >
      <div className="classroom-dashboard-panel-head">
        <h2 id="walking-rewards-title">주간미션</h2>
        <strong className="student-walking-reward-total" aria-label={`받은 보상 ${claimedTotal}원, 전체 ${rewardTotal}원`}>
          {numberFormatter.format(claimedTotal)}원 / {numberFormatter.format(rewardTotal)}원
        </strong>
      </div>

      <div className="student-walking-mission-graph">
        <div
          className="student-walking-mission-graph-track"
          role="progressbar"
          aria-label={`이번 주 ${numberFormatter.format(rewards.totalSteps)}걸음, 목표 ${numberFormatter.format(graphMaxSteps)}걸음`}
          aria-valuemin={0}
          aria-valuemax={graphMaxSteps}
          aria-valuenow={rewards.totalSteps}
          aria-valuetext={`${numberFormatter.format(rewards.totalSteps)}걸음`}
        >
          <span
            className="student-walking-mission-graph-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="student-walking-mission-milestones" aria-label="주간 걷기 보상 단계">
          {rewards.tiers.map((tier) => {
            const achieved = tier.achieved;
            const error = errors[tier.key];
            const state: ClaimState = tier.claimed
              ? "claimed"
              : pendingTierKey === tier.key
                ? "pending"
                : error
                  ? "error"
                  : achieved
                    ? "claimable"
                    : "locked";
            const position = Math.min(100, Math.max(0, (tier.steps / graphMaxSteps) * 100));
            const positionClass = position <= 5 ? "is-start" : position >= 95 ? "is-end" : "";
            const stateLabel =
              state === "claimed"
                ? "수령 완료"
                : state === "pending"
                  ? "처리 중"
                  : state === "error"
                    ? "다시 시도"
                    : state === "claimable"
                      ? "받기"
                      : "잠김";

            return (
              <li
                key={tier.key}
                className={`student-walking-mission-milestone ${positionClass}`}
                style={{ left: `${position}%` }}
              >
                <span className="student-walking-mission-milestone-dot" aria-hidden="true" />
                <span className="student-walking-mission-milestone-steps">
                  {numberFormatter.format(tier.steps)}걸음
                </span>
                <button
                  type="button"
                  className={`student-walking-mission-coin is-${state}`}
                  onClick={() => void claimTier(tier.key)}
                  disabled={!achieved || tier.claimed || pendingTierKey !== null}
                  aria-label={`${numberFormatter.format(tier.steps)}걸음 보상 ${numberFormatter.format(tier.amount)}원, ${stateLabel}`}
                  aria-describedby={error ? `walking-reward-error-${tier.key}` : undefined}
                >
                  <span className="student-walking-mission-coin-amount">
                    {numberFormatter.format(tier.amount)}원
                  </span>
                  <span className="student-walking-mission-coin-state">{stateLabel}</span>
                </button>
                {error ? (
                  <span
                    id={`walking-reward-error-${tier.key}`}
                    className="student-walking-mission-error"
                    role="alert"
                  >
                    {error}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <p className="student-walking-mission-progress-copy">
          {numberFormatter.format(rewards.totalSteps)} / {numberFormatter.format(graphMaxSteps)}걸음
        </p>
      </div>
    </section>
  );
}
