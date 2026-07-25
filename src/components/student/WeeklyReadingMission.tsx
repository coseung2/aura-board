"use client";

import { useEffect, useState } from "react";

import type {
  ReadingMission,
  ReadingMissionKey,
  ReadingWeeklyMissionReward,
} from "@/lib/reading-missions";

type Props = {
  initialReward: ReadingWeeklyMissionReward;
};

type ClaimState = "claimable" | "pending" | "claimed" | "error" | "locked";

const numberFormatter = new Intl.NumberFormat("ko-KR");

function normalizeMission(value: unknown): ReadingMission | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ReadingMission>;
  if (typeof raw.key !== "string") return null;
  return {
    key: raw.key as ReadingMissionKey,
    title: typeof raw.title === "string" ? raw.title : "",
    description: typeof raw.description === "string" ? raw.description : "",
    target: Math.max(0, Math.round(Number(raw.target) || 0)),
    progress: Math.max(0, Math.round(Number(raw.progress) || 0)),
    unit: typeof raw.unit === "string" ? raw.unit : "",
    completed: raw.completed === true,
    amount: Math.max(0, Math.round(Number(raw.amount) || 0)),
    claimed: raw.claimed === true,
    claimable: raw.claimable === true,
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
  return {
    weekStart: raw.weekStart,
    weekEnd: typeof raw.weekEnd === "string" ? raw.weekEnd : "",
    amount: Math.max(0, Math.round(Number(raw.amount) || 0)),
    completedCount: Math.max(0, Math.round(Number(raw.completedCount) || 0)),
    totalCount: Math.max(1, Math.round(Number(raw.totalCount) || missions.length)),
    achieved: raw.achieved === true,
    claimed: raw.claimed === true,
    claimable: raw.claimable === true,
    missions,
  };
}

function claimErrorMessage(error: unknown) {
  if (error === "reward_not_achieved") return "아직 이 미션을 완료하지 않았어요.";
  if (error === "invalid_mission_key") return "보상 대상 미션을 확인해 주세요.";
  if (error === "unauthorized") return "로그인이 필요해요. 다시 로그인해 주세요.";
  return "보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function missionState(mission: ReadingMission, pendingKey: string | null, errorKey: string | null): ClaimState {
  if (mission.claimed) return "claimed";
  if (pendingKey === mission.key) return "pending";
  if (errorKey === mission.key) return "error";
  if (mission.claimable) return "claimable";
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
  const [reward, setReward] = useState(initialReward);
  const [pendingKey, setPendingKey] = useState<ReadingMissionKey | null>(null);
  const [errorKey, setErrorKey] = useState<ReadingMissionKey | null>(null);
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

  async function claim(missionKey: ReadingMissionKey) {
    const mission = reward.missions.find((item) => item.key === missionKey);
    if (!mission || pendingKey || !mission.claimable || mission.claimed) return;
    setPendingKey(missionKey);
    setErrorKey(null);
    setError(null);
    try {
      const response = await fetch("/api/student/reading/rewards/claim", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionKey }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: unknown; weeklyMissionReward?: unknown }
        | null;
      if (!response.ok) {
        setErrorKey(missionKey);
        setError(claimErrorMessage(payload?.error));
        return;
      }
      const next = normalizeReward(payload?.weeklyMissionReward);
      if (next) setReward(next);
      else {
        setReward((current) => ({
          ...current,
          missions: current.missions.map((item) =>
            item.key === missionKey
              ? { ...item, claimed: true, claimable: false, completed: true }
              : item,
          ),
          claimed: current.missions.every((item) =>
            item.key === missionKey ? true : item.claimed,
          ),
          claimable: current.missions.some((item) =>
            item.key === missionKey ? false : item.claimable,
          ),
        }));
      }
    } catch {
      setErrorKey(missionKey);
      setError(claimErrorMessage(null));
    } finally {
      setPendingKey(null);
    }
  }

  const claimableAmount = reward.missions
    .filter((mission) => mission.claimable)
    .reduce((sum, mission) => sum + mission.amount, 0);
  const claimedCount = reward.missions.filter((mission) => mission.claimed).length;

  return (
    <section
      className="classroom-dashboard-panel student-reading-future-missions"
      aria-labelledby="reading-missions-title"
    >
      <div className="classroom-dashboard-panel-head">
        <div>
          <h2 id="reading-missions-title">독서 미션</h2>
          <p>학생마다 매주 새로운 목표가 정해져요. 미션마다 따로 보상을 받아요.</p>
        </div>
        <strong
          className="student-walking-reward-total"
          aria-label={`완료 ${reward.completedCount}개, 수령 ${claimedCount}개, 목표 ${reward.totalCount}개`}
        >
          {reward.completedCount}/{reward.totalCount}
        </strong>
      </div>

      <ul className="student-reading-future-mission-list">
        {reward.missions.map((mission) => {
          const percent = Math.min(
            100,
            Math.round((mission.progress / Math.max(1, mission.target)) * 100),
          );
          const state = missionState(mission, pendingKey, errorKey);
          const label = stateLabel(state);
          return (
            <li
              className={
                mission.claimed
                  ? "is-complete"
                  : mission.completed
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
                <strong>보상 {numberFormatter.format(mission.amount)}원</strong>
                <button
                  type="button"
                  className={`student-walking-mission-coin is-${state}`}
                  onClick={() => void claim(mission.key)}
                  disabled={!mission.claimable || mission.claimed || pendingKey !== null}
                  aria-label={`${mission.title} 보상 ${numberFormatter.format(mission.amount)}원 ${label}`}
                  aria-describedby={
                    errorKey === mission.key && error ? "reading-reward-error" : undefined
                  }
                >
                  <span className="student-walking-mission-coin-amount">
                    {numberFormatter.format(mission.amount)}원
                  </span>
                  <span className="student-walking-mission-coin-state">{label}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="student-reading-final-reward">
        <div className="student-reading-final-reward-copy">
          <strong>미션별 보상 합계 ×{numberFormatter.format(reward.amount)}</strong>
          <p>
            {reward.claimed
              ? "이번 주 미션 보상을 모두 받았어요."
              : claimableAmount > 0
                ? `지금 받을 수 있는 보상 ${numberFormatter.format(claimableAmount)}원`
                : "각 미션을 완료하면 바로 보상을 받을 수 있어요."}
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
