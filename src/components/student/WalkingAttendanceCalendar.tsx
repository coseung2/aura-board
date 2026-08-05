"use client";

import { useMemo } from "react";

import { WALKING_MONTHLY_COOKIE_REWARD_ORDINALS } from "@/lib/reward-policy";

import {
  MOBILE_ATTENDANCE_STAMP_SRC,
  MissionAttendanceReward,
} from "./MobileMissionAssets";

type Props = {
  month: string;
  monthDays: number;
  attendanceCount: number;
  visitCount?: number;
  claimedOrdinals?: number[];
  claimableAttendance?: Array<{ ordinal: number; day: string }>;
  itemRewardOrdinal?: number;
  claimingDay?: string | null;
  onClaim?: (day: string) => void;
};

const MONTH_DAYS = 28;
const COOKIE_REWARD_ORDINALS: ReadonlySet<number> = new Set(
  WALKING_MONTHLY_COOKIE_REWARD_ORDINALS,
);

function clampAttendanceCount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MONTH_DAYS, Math.max(0, Math.floor(value)));
}

function cashRewardAmount(ordinal: number) {
  return ordinal % 7 === 0 ? 20 : 10;
}

function rewardLabel(ordinal: number, itemRewardOrdinal: number) {
  if (ordinal === itemRewardOrdinal) return "아이템 보상";
  const cashLabel = `${cashRewardAmount(ordinal)}원`;
  return COOKIE_REWARD_ORDINALS.has(ordinal)
    ? `${cashLabel} + 쿠키 1개`
    : cashLabel;
}

/** Mobile-parity 28-step attendance calendar for walking missions. */
export function WalkingAttendanceCalendar({
  month,
  attendanceCount,
  visitCount = attendanceCount,
  claimedOrdinals,
  claimableAttendance = [],
  itemRewardOrdinal = MONTH_DAYS,
  claimingDay = null,
  onClaim,
}: Props) {
  const safeAttendanceCount = clampAttendanceCount(attendanceCount);
  const safeVisitCount = clampAttendanceCount(visitCount);
  const ordinals = useMemo(
    () => Array.from({ length: MONTH_DAYS }, (_, index) => index + 1),
    [],
  );
  const claimed = useMemo(
    () =>
      new Set(
        claimedOrdinals ??
          Array.from({ length: safeAttendanceCount }, (_, index) => index + 1),
      ),
    [claimedOrdinals, safeAttendanceCount],
  );
  const claimableByOrdinal = useMemo(
    () => new Map(claimableAttendance.map((entry) => [entry.ordinal, entry.day])),
    [claimableAttendance],
  );

  return (
    <div
      className="student-walking-attendance-board"
      data-month={month}
      data-month-days={MONTH_DAYS}
      data-attendance-count={safeAttendanceCount}
      aria-label={`${month} 출석 달력, ${safeVisitCount}/${MONTH_DAYS}회 방문`}
    >
      <div
        className="student-walking-ordinal-grid"
        role="list"
        aria-label="월간 출석 달력"
      >
        {ordinals.map((ordinal) => {
          const isClaimed = claimed.has(ordinal);
          const claimableDay = claimableByOrdinal.get(ordinal) ?? null;
          const isItemReward = ordinal === itemRewardOrdinal;
          const isCookieReward = COOKIE_REWARD_ORDINALS.has(ordinal);
          const isMilestone = isCookieReward || isItemReward;
          const label = rewardLabel(ordinal, itemRewardOrdinal);
          const kind = isItemReward
            ? "item"
            : isCookieReward
              ? "cookie"
              : "cash";
          const stateLabel = isClaimed
            ? "출석 도장 완료"
            : claimableDay
              ? "보상 받기"
              : "아직 미달성";

          return (
            <div
              key={ordinal}
              className="student-walking-ordinal-slot"
              role="listitem"
            >
              <button
                type="button"
                className={`student-walking-ordinal-cell${
                  isClaimed ? " is-earned is-stamped" : ""
                }${claimableDay ? " is-claimable" : ""}${
                  isMilestone ? " is-milestone" : ""
                }${isItemReward ? " is-item-reward" : ""}`}
                data-ordinal={ordinal}
                aria-label={`${ordinal}일차, ${label}, ${stateLabel}`}
                aria-pressed={isClaimed}
                aria-busy={Boolean(claimableDay && claimingDay === claimableDay)}
                disabled={
                  !claimableDay ||
                  isClaimed ||
                  claimingDay !== null ||
                  !onClaim
                }
                onClick={() => {
                  if (claimableDay) onClaim?.(claimableDay);
                }}
              >
                {claimableDay && !isClaimed ? (
                  <span
                    className="student-walking-claimable-marker"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="student-walking-ordinal-number">
                  {ordinal}일차
                </span>
                <span
                  className={`student-walking-ordinal-reward${
                    isItemReward ? " is-item-reward" : ""
                  }${isCookieReward ? " is-cookie-reward" : ""}`}
                >
                  <MissionAttendanceReward
                    kind={kind}
                    amount={cashRewardAmount(ordinal)}
                  />
                </span>
                {isClaimed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="student-walking-ordinal-stamp"
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
  );
}
