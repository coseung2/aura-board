"use client";

import { useEffect, useMemo, useState } from "react";

import { MONTHLY_ATTENDANCE_COOKIE_REWARD_ORDINALS } from "@/lib/reward-policy";
import type { MonthlyAttendanceSummary } from "@/lib/student-attendance";

type Props = {
  studentId: string;
  attendance: MonthlyAttendanceSummary;
};

const COOKIE_REWARD_ORDINALS: ReadonlySet<number> = new Set(
  MONTHLY_ATTENDANCE_COOKIE_REWARD_ORDINALS,
);

function rewardLabel(ordinal: number, itemRewardOrdinal: number) {
  if (ordinal === itemRewardOrdinal) return "아이템 보상";
  const cash = ordinal % 7 === 0 ? "20원" : "10원";
  return COOKIE_REWARD_ORDINALS.has(ordinal) ? `${cash} + 쿠키 1개` : cash;
}

/** Shared monthly mission awarded for opening the student app once per KST day. */
export function AttendanceMission({ studentId, attendance }: Props) {
  const [currentAttendance, setCurrentAttendance] = useState(attendance);
  const count = Math.min(
    currentAttendance.monthDays,
    Math.max(0, currentAttendance.attendanceCount),
  );
  const storageKey = `aura:attendance-stamps:${studentId}:${currentAttendance.month}`;
  const ordinals = useMemo(
    () => Array.from({ length: currentAttendance.monthDays }, (_, index) => index + 1),
    [currentAttendance.monthDays],
  );
  const [stamped, setStamped] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      setStamped(new Set(
        Array.isArray(stored)
          ? stored.filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= count)
          : [],
      ));
    } catch {
      setStamped(new Set());
    }
  }, [count, storageKey]);

  useEffect(() => {
    let active = true;
    fetch("/api/student/attendance", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { attendance?: MonthlyAttendanceSummary };
        if (active && payload.attendance) setCurrentAttendance(payload.attendance);
      })
      .catch(() => {
        // The server-rendered value stays usable if a transient visit request fails.
      });
    return () => {
      active = false;
    };
  }, []);

  const stamp = (ordinal: number) => {
    if (ordinal > count) return;
    setStamped((current) => {
      if (current.has(ordinal)) return current;
      const next = new Set(current).add(ordinal);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // The mission progress remains available even when local storage is blocked.
      }
      return next;
    });
  };

  return (
    <section className="classroom-dashboard-panel student-attendance-panel" aria-label="월간 출석 미션">
      <div className="classroom-dashboard-panel-head">
        <h2>출석미션</h2>
        <strong className={`student-attendance-status${count >= currentAttendance.monthDays ? " is-complete" : ""}`}>
          {count} / {currentAttendance.monthDays}일
        </strong>
      </div>
      <div className="student-attendance-board" aria-label={`${currentAttendance.month} 출석 보드, ${count}/${currentAttendance.monthDays}일 달성`}>
        <div className="student-attendance-ordinal-grid" role="list" aria-label="월간 출석 칸">
          {ordinals.map((ordinal) => {
            const earned = ordinal <= count;
            const isItemReward = ordinal === currentAttendance.itemRewardOrdinal;
            const label = rewardLabel(ordinal, currentAttendance.itemRewardOrdinal);
            const content = (
              <>
                <span className="student-attendance-ordinal-number">{ordinal}</span>
                <span className={`student-attendance-ordinal-reward${isItemReward ? " is-item-reward" : ""}`}>
                  {isItemReward ? <><span>아이템</span><small>보상 자리</small></> : label}
                </span>
                {stamped.has(ordinal) ? <strong className="student-attendance-ordinal-stamp" aria-hidden="true">출석</strong> : null}
              </>
            );
            return (
              <div key={ordinal} className="student-attendance-ordinal-slot" role="listitem">
                {earned ? (
                  <button
                    type="button"
                    className={`student-attendance-ordinal-cell is-earned${stamped.has(ordinal) ? " is-stamped" : ""}${isItemReward ? " is-item-reward" : ""}`}
                    aria-label={`${ordinal}번, ${label}, ${stamped.has(ordinal) ? "출석 도장 완료" : "출석 도장 찍기"}`}
                    aria-pressed={stamped.has(ordinal)}
                    onClick={() => stamp(ordinal)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={`student-attendance-ordinal-cell${isItemReward ? " is-item-reward" : ""}`} aria-label={`${ordinal}번, ${label}, 아직 미달성`}>
                    {content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
