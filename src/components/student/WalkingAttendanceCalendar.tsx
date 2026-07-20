"use client";

import { useEffect, useMemo, useState } from "react";
import { WALKING_MONTHLY_COOKIE_REWARD_ORDINALS } from "@/lib/reward-policy";

type Props = {
  studentId: string;
  month: string;
  monthDays: number;
  attendanceCount: number;
};

const MIN_MONTH_DAYS = 28;
const MAX_MONTH_DAYS = 28;
const COOKIE_REWARD_ORDINALS: ReadonlySet<number> = new Set(
  WALKING_MONTHLY_COOKIE_REWARD_ORDINALS,
);

function clampMonthDays(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.min(MAX_MONTH_DAYS, Math.max(MIN_MONTH_DAYS, Math.floor(value)));
}

function clampAttendanceCount(value: number, monthDays: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(monthDays, Math.max(0, Math.floor(value)));
}

function cashRewardLabel(ordinal: number) {
  return ordinal % 7 === 0 ? "20원" : "10원";
}

function rewardLabel(ordinal: number, itemRewardOrdinal: number) {
  if (ordinal === itemRewardOrdinal) return "아이템 보상";
  const cashLabel = cashRewardLabel(ordinal);
  return COOKIE_REWARD_ORDINALS.has(ordinal)
    ? `${cashLabel} + 쿠키 1개`
    : cashLabel;
}

/**
 * Render the monthly walking attendance board as an ordinal sequence. A
 * synced day earns the next ordinal; weekdays and the date's position in a
 * calendar grid do not affect the board.
 */
export function WalkingAttendanceCalendar({
  studentId,
  month,
  monthDays,
  attendanceCount,
}: Props) {
  const safeMonthDays = clampMonthDays(monthDays);
  const safeAttendanceCount = clampAttendanceCount(attendanceCount, safeMonthDays);
  const itemRewardOrdinal = 28;
  const storageKey = `aura:walking-attendance-stamps:${studentId}:${month}`;
  const ordinals = useMemo(
    () => Array.from({ length: safeMonthDays }, (_, index) => index + 1),
    [safeMonthDays],
  );
  const [stampedOrdinals, setStampedOrdinals] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      if (!Array.isArray(stored)) {
        setStampedOrdinals(new Set());
        return;
      }
      setStampedOrdinals(
        new Set(
          stored.filter(
            (ordinal): ordinal is number =>
              typeof ordinal === "number" &&
              Number.isInteger(ordinal) &&
              ordinal >= 1 &&
              ordinal <= safeAttendanceCount,
          ),
        ),
      );
    } catch {
      setStampedOrdinals(new Set());
    }
  }, [safeAttendanceCount, storageKey]);

  function stamp(ordinal: number) {
    if (ordinal < 1 || ordinal > safeAttendanceCount) return;
    setStampedOrdinals((current) => {
      if (current.has(ordinal)) return current;
      const next = new Set(current).add(ordinal);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Keep the in-memory stamp when browser storage is unavailable.
      }
      return next;
    });
  }

  return (
    <div
      className="student-walking-attendance-board"
      data-month={month}
      data-month-days={safeMonthDays}
      data-attendance-count={safeAttendanceCount}
      aria-label={`${month} 출석 보드, ${safeAttendanceCount}/${safeMonthDays}일 달성`}
    >
      <div className="student-walking-ordinal-grid" role="list" aria-label="월간 출석 칸">
        {ordinals.map((ordinal) => {
          const earned = ordinal <= safeAttendanceCount;
          const stamped = stampedOrdinals.has(ordinal);
          const isItemReward = ordinal === itemRewardOrdinal;
          const isCookieReward = COOKIE_REWARD_ORDINALS.has(ordinal);
          const label = rewardLabel(ordinal, itemRewardOrdinal);
          const content = (
            <>
              <span className="student-walking-ordinal-number">{ordinal}</span>
              <span
                className={`student-walking-ordinal-reward${
                  isItemReward ? " is-item-reward" : ""
                }${isCookieReward ? " is-cookie-reward" : ""}`}
              >
                {isItemReward ? (
                  <>
                    <span>아이템</span>
                    <small>보상 자리</small>
                  </>
                ) : isCookieReward ? (
                  <>
                    <span>{cashRewardLabel(ordinal)}</span>
                    <small>쿠키 1개</small>
                  </>
                ) : (
                  label
                )}
              </span>
              {stamped ? (
                <strong className="student-walking-ordinal-stamp" aria-hidden="true">
                  출석
                </strong>
              ) : null}
            </>
          );

          if (!earned) {
            return (
              <div
                key={ordinal}
                className="student-walking-ordinal-slot"
                role="listitem"
              >
                <div
                  className={`student-walking-ordinal-cell${
                    isItemReward ? " is-item-reward" : ""
                  }`}
                  data-ordinal={ordinal}
                  aria-label={`${ordinal}번, ${label}, 아직 미달성`}
                >
                  {content}
                </div>
              </div>
            );
          }

          return (
            <div
              key={ordinal}
              className="student-walking-ordinal-slot"
              role="listitem"
            >
              <button
                type="button"
                className={`student-walking-ordinal-cell is-earned${
                  stamped ? " is-stamped" : ""
                }${isItemReward ? " is-item-reward" : ""}`}
                data-ordinal={ordinal}
                aria-label={`${ordinal}번, ${label}, ${
                  stamped ? "출석 도장 완료" : "출석 도장 찍기"
                }`}
                aria-pressed={stamped}
                onClick={() => stamp(ordinal)}
              >
                {content}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
