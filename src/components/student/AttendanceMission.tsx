"use client";

import { useEffect, useMemo, useState } from "react";

import { MONTHLY_ATTENDANCE_COOKIE_REWARD_ORDINALS } from "@/lib/reward-policy";
import type { MonthlyAttendanceSummary } from "@/lib/student-attendance";

import {
  MOBILE_ATTENDANCE_STAMP_SRC,
  MissionAttendanceReward,
} from "./MobileMissionAssets";

type Props = {
  attendance: MonthlyAttendanceSummary;
};

const COOKIE_REWARD_ORDINALS: ReadonlySet<number> = new Set(
  MONTHLY_ATTENDANCE_COOKIE_REWARD_ORDINALS,
);

function cashRewardAmount(ordinal: number) {
  return ordinal % 7 === 0 ? 20 : 10;
}

function rewardLabel(ordinal: number, itemRewardOrdinal: number) {
  if (ordinal === itemRewardOrdinal) return "아이템 보상";
  const cash = `${cashRewardAmount(ordinal)}원`;
  return COOKIE_REWARD_ORDINALS.has(ordinal) ? `${cash} + 쿠키 1개` : cash;
}

/** Shared monthly attendance mission used by the reading activity. */
export function AttendanceMission({ attendance }: Props) {
  const [currentAttendance, setCurrentAttendance] = useState(attendance);
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ordinals = useMemo(
    () => Array.from({ length: currentAttendance.monthDays }, (_, index) => index + 1),
    [currentAttendance.monthDays],
  );
  const claimedOrdinals = useMemo(
    () => new Set(currentAttendance.claimedOrdinals),
    [currentAttendance.claimedOrdinals],
  );
  const claimableByOrdinal = useMemo(
    () => new Map(currentAttendance.claimableAttendance.map((entry) => [entry.ordinal, entry.day])),
    [currentAttendance.claimableAttendance],
  );
  const visitCount = Math.min(
    currentAttendance.monthDays,
    Math.max(currentAttendance.attendanceCount, currentAttendance.visitCount),
  );

  useEffect(() => {
    let active = true;
    fetch("/api/student/attendance", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          attendance?: MonthlyAttendanceSummary;
        };
        if (active && payload.attendance) setCurrentAttendance(payload.attendance);
      })
      .catch(() => {
        // Keep the server-rendered board when the idempotent visit request fails.
      });
    return () => {
      active = false;
    };
  }, []);

  async function claim(day: string) {
    if (busyDay) return;
    setBusyDay(day);
    setError(null);
    try {
      const response = await fetch("/api/student/attendance", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ day }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { attendance?: MonthlyAttendanceSummary }
        | null;
      if (!response.ok || !payload?.attendance) {
        throw new Error("출석 보상을 받지 못했어요.");
      }
      setCurrentAttendance(payload.attendance);
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "출석 보상을 받지 못했어요.",
      );
    } finally {
      setBusyDay(null);
    }
  }

  return (
    <section
      className="student-mission-section student-attendance-panel"
      aria-label="월간 출석 미션"
    >
      <div className="student-mission-section-header">
        <h2>출석미션</h2>
        <strong
          className={`student-attendance-status${
            visitCount >= currentAttendance.monthDays ? " is-complete" : ""
          }`}
        >
          {visitCount} / {currentAttendance.monthDays}회
        </strong>
      </div>
      <div
        className="student-attendance-board"
        aria-label={`${currentAttendance.month} 출석 달력, ${visitCount}/${currentAttendance.monthDays}회 방문`}
      >
        <div
          className="student-attendance-ordinal-grid"
          role="list"
          aria-label="월간 출석 달력"
        >
          {ordinals.map((ordinal) => {
            const claimed = claimedOrdinals.has(ordinal);
            const claimableDay = claimableByOrdinal.get(ordinal) ?? null;
            const isItemReward = ordinal === currentAttendance.itemRewardOrdinal;
            const isCookieReward = COOKIE_REWARD_ORDINALS.has(ordinal);
            const isMilestone = isCookieReward || isItemReward;
            const label = rewardLabel(ordinal, currentAttendance.itemRewardOrdinal);
            const kind = isItemReward
              ? "item"
              : isCookieReward
                ? "cookie"
                : "cash";
            const stateLabel = claimed
              ? "출석 도장 완료"
              : claimableDay
                ? "보상 받기"
                : "아직 미달성";
            return (
              <div
                key={ordinal}
                className="student-attendance-ordinal-slot"
                role="listitem"
              >
                <button
                  type="button"
                  className={`student-attendance-ordinal-cell${
                    claimed ? " is-earned is-stamped" : ""
                  }${claimableDay ? " is-claimable" : ""}${
                    isMilestone ? " is-milestone" : ""
                  }${isItemReward ? " is-item-reward" : ""}`}
                  aria-label={`${ordinal}일차, ${label}, ${stateLabel}`}
                  aria-pressed={claimed}
                  aria-busy={Boolean(claimableDay && busyDay === claimableDay)}
                  disabled={!claimableDay || claimed || busyDay !== null}
                  onClick={() => {
                    if (claimableDay) void claim(claimableDay);
                  }}
                >
                  {claimableDay && !claimed ? (
                    <span
                      className="student-attendance-claimable-marker"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="student-attendance-ordinal-number">
                    {ordinal}일차
                  </span>
                  <span
                    className={`student-attendance-ordinal-reward${
                      isItemReward ? " is-item-reward" : ""
                    }${isCookieReward ? " is-cookie-reward" : ""}`}
                  >
                    <MissionAttendanceReward
                      kind={kind}
                      amount={cashRewardAmount(ordinal)}
                    />
                  </span>
                  {claimed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="student-attendance-ordinal-stamp"
                      src={MOBILE_ATTENDANCE_STAMP_SRC}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {error ? (
        <p className="student-activity-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
