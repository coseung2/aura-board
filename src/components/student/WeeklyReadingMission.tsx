"use client";

import { useEffect, useState } from "react";

import type {
  ReadingMission,
  ReadingMissionKey,
  ReadingMissionStep,
  ReadingWeeklyMissionReward,
} from "@/lib/reading-missions";
import { READING_MISSION_STEP_REWARD_AMOUNT } from "@/lib/reading-missions";

type Props = {
  initialReward: ReadingWeeklyMissionReward;
};

type ClaimState = "claimable" | "pending" | "claimed" | "error" | "locked";
type PendingClaimKey = `${ReadingMissionKey}:${number}`;

const numberFormatter = new Intl.NumberFormat("ko-KR");

const stepsRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: "10px 12px",
} as const;

const stepItemStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "4px",
  minWidth: "56px",
  maxWidth: "100%",
} as const;

function pendingClaimKey(missionKey: ReadingMissionKey, unit: number): PendingClaimKey {
  return `${missionKey}:${unit}`;
}

function normalizeStep(value: unknown, fallbackUnit: number): ReadingMissionStep | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ReadingMissionStep>;
  const unit = Math.max(1, Math.round(Number(raw.unit) || fallbackUnit));
  const target = Math.max(0, Math.round(Number(raw.target) || 0));
  if (!Number.isSafeInteger(unit) || unit < 1) return null;
  return {
    unit,
    target,
    amount: READING_MISSION_STEP_REWARD_AMOUNT,
    achieved: raw.achieved === true,
    claimed: raw.claimed === true,
    claimable: raw.claimable === true,
  };
}

function fallbackSteps(mission: {
  key: ReadingMissionKey;
  target: number;
  progress: number;
  claimed: boolean;
  claimable: boolean;
}): ReadingMissionStep[] {
  const stepSize = mission.key === "reflection_chars" ? 200 : 1;
  const stepCount = Math.max(0, Math.floor(mission.target / stepSize));
  return Array.from({ length: stepCount }, (_, index) => {
    const unit = index + 1;
    const target = unit * stepSize;
    const achieved = mission.progress >= target;
    // Without authoritative step data, only the first claimable unit is interactive.
    const claimed = mission.claimed || (mission.claimable ? false : achieved);
    return {
      unit,
      target,
      amount: READING_MISSION_STEP_REWARD_AMOUNT,
      achieved,
      claimed,
      claimable: achieved && !claimed && mission.claimable && unit === 1,
    };
  });
}

function normalizeMission(value: unknown): ReadingMission | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ReadingMission> & { steps?: unknown };
  if (typeof raw.key !== "string") return null;
  const key = raw.key as ReadingMissionKey;
  const target = Math.max(0, Math.round(Number(raw.target) || 0));
  const progress = Math.max(0, Math.round(Number(raw.progress) || 0));
  const claimed = raw.claimed === true;
  const claimable = raw.claimable === true;
  const rawSteps = Array.isArray(raw.steps)
    ? raw.steps
        .map((step, index) => normalizeStep(step, index + 1))
        .filter((step): step is ReadingMissionStep => step !== null)
    : [];
  const steps =
    rawSteps.length > 0
      ? rawSteps
      : fallbackSteps({ key, target, progress, claimed, claimable });
  const achievedStepCount = steps.filter((step) => step.achieved).length;
  const claimedStepCount = steps.filter((step) => step.claimed).length;
  const claimableStepCount = steps.filter((step) => step.claimable).length;
  return {
    key,
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    target,
    progress,
    unit: typeof raw.unit === "string" ? raw.unit : "",
    completed: raw.completed === true || progress >= target,
    amount: Math.max(
      0,
      Math.round(Number(raw.amount) || steps.length * READING_MISSION_STEP_REWARD_AMOUNT),
    ),
    claimed: steps.length > 0 ? claimedStepCount === steps.length : claimed,
    claimable: claimableStepCount > 0,
    steps,
    achievedStepCount,
    claimedStepCount,
    claimableStepCount,
    claimedAmount: claimedStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
    claimableAmount: claimableStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
  };
}

function normalizeReward(value: unknown): ReadingWeeklyMissionReward | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ReadingWeeklyMissionReward> & {
    missions?: unknown;
  };
  if (!Array.isArray(raw.missions) || typeof raw.weekStart !== "string") return null;
  const missions = raw.missions
    .map((mission) => normalizeMission(mission))
    .filter((mission): mission is ReadingMission => mission !== null);
  if (missions.length === 0) return null;
  const totalStepCount = missions.reduce((sum, mission) => sum + (mission.steps?.length ?? 0), 0);
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
  return {
    weekStart: raw.weekStart,
    weekEnd: typeof raw.weekEnd === "string" ? raw.weekEnd : "",
    amount: Math.max(
      0,
      Math.round(Number(raw.amount) || totalStepCount * READING_MISSION_STEP_REWARD_AMOUNT),
    ),
    completedCount: Math.max(0, Math.round(Number(raw.completedCount) || 0)),
    totalCount: Math.max(1, Math.round(Number(raw.totalCount) || missions.length)),
    achieved: raw.achieved === true,
    claimed: missions.length > 0 && missions.every((mission) => mission.claimed),
    claimable: missions.some((mission) => mission.claimable),
    totalStepCount,
    achievedStepCount,
    claimedStepCount,
    claimableStepCount,
    achievedAmount: achievedStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
    claimedAmount: claimedStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
    claimableAmount: claimableStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
    missions,
  };
}

function claimErrorMessage(error: unknown) {
  if (error === "reward_not_achieved") return "아직 이 미션을 완료하지 않았어요.";
  if (error === "invalid_mission_key" || error === "invalid_unit") {
    return "보상 대상 미션을 확인해 주세요.";
  }
  if (error === "unauthorized") return "로그인이 필요해요. 다시 로그인해 주세요.";
  return "보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function missionSteps(mission: ReadingMission): ReadingMissionStep[] {
  if (mission.steps && mission.steps.length > 0) return mission.steps;
  return fallbackSteps(mission);
}

function stepState(
  step: ReadingMissionStep,
  pendingKey: PendingClaimKey | null,
  errorKey: PendingClaimKey | null,
  claimKey: PendingClaimKey,
): ClaimState {
  if (step.claimed) return "claimed";
  if (pendingKey === claimKey) return "pending";
  if (errorKey === claimKey) return "error";
  if (step.claimable) return "claimable";
  return "locked";
}

function stateLabel(state: ClaimState) {
  if (state === "claimed") return "수령 완료";
  if (state === "pending") return "처리 중";
  if (state === "error") return "다시 시도";
  if (state === "claimable") return "받기";
  return "잠김";
}

export function WeeklyReadingMission({ initialReward }: Props) {
  const [reward, setReward] = useState(() => normalizeReward(initialReward) ?? initialReward);
  const [pendingKey, setPendingKey] = useState<PendingClaimKey | null>(null);
  const [errorKey, setErrorKey] = useState<PendingClaimKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/student/reading", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          weeklyMissionReward?: unknown;
        };
        const next = normalizeReward(payload.weeklyMissionReward);
        if (!cancelled && next) setReward(next);
      } catch {
        // Keep server-rendered values if the refresh fails.
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, []);

  async function claim(missionKey: ReadingMissionKey, unit: number) {
    const mission = reward.missions.find((item) => item.key === missionKey);
    const step = mission ? missionSteps(mission).find((item) => item.unit === unit) : undefined;
    const claimKey = pendingClaimKey(missionKey, unit);
    if (!mission || !step || pendingKey || !step.claimable || step.claimed) return;

    setPendingKey(claimKey);
    setErrorKey(null);
    setError(null);
    try {
      const response = await fetch("/api/student/reading/rewards/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionKey, unit }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: unknown; weeklyMissionReward?: unknown }
        | null;
      if (!response.ok) {
        setErrorKey(claimKey);
        setError(claimErrorMessage(payload?.error));
        return;
      }

      const next = normalizeReward(payload?.weeklyMissionReward);
      if (next) {
        setReward(next);
        return;
      }

      // Prefer the authoritative package from the claim response; only fall back
      // to a local step mark when the payload is incomplete, then re-fetch.
      setReward((current) => ({
        ...current,
        missions: current.missions.map((item) => {
          if (item.key !== missionKey) return item;
          const steps = missionSteps(item).map((candidate) =>
            candidate.unit === unit
              ? { ...candidate, claimed: true, claimable: false, achieved: true }
              : candidate,
          );
          const claimedStepCount = steps.filter((candidate) => candidate.claimed).length;
          const claimableStepCount = steps.filter((candidate) => candidate.claimable).length;
          return {
            ...item,
            steps,
            claimed: steps.length > 0 && claimedStepCount === steps.length,
            claimable: claimableStepCount > 0,
            claimedStepCount,
            claimableStepCount,
            claimedAmount: claimedStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
            claimableAmount: claimableStepCount * READING_MISSION_STEP_REWARD_AMOUNT,
          };
        }),
      }));

      try {
        const refreshResponse = await fetch("/api/student/reading", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!refreshResponse.ok) return;
        const refreshPayload = (await refreshResponse.json()) as {
          weeklyMissionReward?: unknown;
        };
        const refreshed = normalizeReward(refreshPayload.weeklyMissionReward);
        if (refreshed) setReward(refreshed);
      } catch {
        // Local claimed state remains until the next successful refresh.
      }
    } catch {
      setErrorKey(claimKey);
      setError(claimErrorMessage(null));
    } finally {
      setPendingKey(null);
    }
  }

  const claimableAmount =
    reward.claimableAmount ??
    reward.missions
      .flatMap((mission) => missionSteps(mission))
      .filter((step) => step.claimable)
      .reduce((sum, step) => sum + step.amount, 0);
  const claimedCount =
    reward.claimedStepCount ??
    reward.missions
      .flatMap((mission) => missionSteps(mission))
      .filter((step) => step.claimed).length;
  const totalStepCount =
    reward.totalStepCount ??
    reward.missions.reduce((sum, mission) => sum + missionSteps(mission).length, 0);

  return (
    <section
      className="classroom-dashboard-panel student-reading-future-missions"
      aria-labelledby="reading-missions-title"
    >
      <div className="classroom-dashboard-panel-head">
        <div>
          <h2 id="reading-missions-title">독서 미션</h2>
          <p>학생마다 매주 새로운 목표가 정해져요. 단계마다 따로 보상을 받아요.</p>
        </div>
        <strong
          className="student-walking-reward-total"
          aria-label={`완료 ${reward.completedCount}개, 수령 ${claimedCount}단계, 목표 ${reward.totalCount}개`}
        >
          {reward.completedCount}/{reward.totalCount}
        </strong>
      </div>

      <ul className="student-reading-future-mission-list">
        {reward.missions.map((mission) => {
          const steps = missionSteps(mission);
          const percent = Math.min(
            100,
            Math.round((mission.progress / Math.max(1, mission.target)) * 100),
          );
          return (
            <li
              className={
                mission.claimed
                  ? "is-complete"
                  : mission.claimable || mission.completed
                    ? "is-claimable"
                    : undefined
              }
              key={mission.key}
            >
              <div className="student-reading-mission-heading">
                <strong>{mission.title}</strong>
                <span>
                  {mission.claimed
                    ? "수령 완료"
                    : mission.completed
                      ? "수령 가능"
                      : `${mission.progress}/${mission.target}${mission.unit}`}
                </span>
              </div>
              <p>{mission.description}</p>
              <div
                className="student-reading-mission-progress"
                role="progressbar"
                aria-label={`${mission.title} 진행도 ${mission.progress}/${mission.target}${mission.unit}`}
                aria-valuemin={0}
                aria-valuemax={mission.target}
                aria-valuenow={Math.min(mission.target, mission.progress)}
                aria-valuetext={`${mission.progress}/${mission.target}${mission.unit}`}
              >
                <span style={{ width: `${percent}%` }} />
              </div>
              <div className="student-reading-mission-reward-row">
                <strong>
                  보상 {numberFormatter.format(mission.amount)}원
                  {steps.length > 1
                    ? ` · 단계 ${mission.claimedStepCount ?? steps.filter((step) => step.claimed).length}/${steps.length}`
                    : ""}
                </strong>
              </div>
              <div
                className="student-reading-mission-steps"
                style={stepsRowStyle}
                aria-label={`${mission.title} 단계별 보상`}
              >
                {steps.map((step) => {
                  const claimKey = pendingClaimKey(mission.key, step.unit);
                  const state = stepState(step, pendingKey, errorKey, claimKey);
                  const label = stateLabel(state);
                  const isBusy = pendingKey !== null;
                  return (
                    <div
                      className="student-reading-mission-step"
                      style={stepItemStyle}
                      key={step.unit}
                    >
                      <span className="student-reading-mission-step-target">
                        {numberFormatter.format(step.target)}
                        {mission.unit}
                      </span>
                      {step.claimed ? (
                        <span className="student-reading-mission-step-state">수령 완료</span>
                      ) : (
                        <button
                          type="button"
                          className={`student-walking-mission-coin is-${state}`}
                          onClick={() => void claim(mission.key, step.unit)}
                          disabled={!step.claimable || step.claimed || isBusy}
                          aria-label={`${mission.title} ${numberFormatter.format(step.target)}${mission.unit} 보상 ${numberFormatter.format(step.amount)}원 ${label}`}
                          aria-describedby={
                            errorKey === claimKey && error ? "reading-reward-error" : undefined
                          }
                        >
                          <span className="student-walking-mission-coin-amount">
                            {numberFormatter.format(step.amount)}원
                          </span>
                          <span className="student-walking-mission-coin-state">{label}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="student-reading-final-reward">
        <div className="student-reading-final-reward-copy">
          <strong>
            미션별 보상 합계 {numberFormatter.format(reward.amount)}원
            {totalStepCount > 0 ? ` · ${totalStepCount}단계` : ""}
          </strong>
          <p>
            {reward.claimed
              ? "이번 주 미션 보상을 모두 받았어요."
              : claimableAmount > 0
                ? `지금 받을 수 있는 보상 ${numberFormatter.format(claimableAmount)}원`
                : "각 미션 단계를 완료하면 바로 보상을 받을 수 있어요."}
          </p>
        </div>
        {error ? (
          <p id="reading-reward-error" className="student-walking-mission-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
