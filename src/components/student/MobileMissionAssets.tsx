"use client";

import cookieReward from "../../../apps/mobile/assets/slimes/shared/cookie-shop-icon-256.png";
import attendanceStamp from "../../../apps/mobile/assets/walking/attendance-stamp.png";
import rewardClaimButtonDisabled from "../../../apps/mobile/assets/walking/reward-claim-button-disabled.png";
import rewardClaimButton from "../../../apps/mobile/assets/walking/reward-claim-button.png";
import rewardCoin from "../../../apps/mobile/assets/walking/reward-coin.png";

const numberFormatter = new Intl.NumberFormat("ko-KR");

export const MOBILE_ATTENDANCE_STAMP_SRC = attendanceStamp.src;

export function MissionAttendanceReward({
  kind,
  amount,
}: {
  kind: "cash" | "cookie" | "item";
  amount: number;
}) {
  if (kind === "item") {
    return (
      <span className="student-mobile-calendar-reward is-item" aria-hidden="true">
        <span className="student-mobile-calendar-gift">🎁</span>
        <span>x1</span>
      </span>
    );
  }

  const source = kind === "cookie" ? cookieReward.src : rewardCoin.src;
  const quantity = kind === "cookie" ? 1 : amount;
  return (
    <span className={`student-mobile-calendar-reward is-${kind}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt="" />
      <span>x{numberFormatter.format(quantity)}</span>
    </span>
  );
}

export function MissionRewardCoin({ amount }: { amount: number }) {
  return (
    <span
      className="student-mobile-reward-coin"
      aria-label={`${numberFormatter.format(amount)}원 보상`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={rewardCoin.src} alt="" aria-hidden="true" />
      <span>×{numberFormatter.format(amount)}</span>
    </span>
  );
}

export function MissionRewardClaimButton({
  disabled,
  busy = false,
  label,
  onClick,
}: {
  disabled: boolean;
  busy?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="student-mobile-reward-claim"
      disabled={disabled || busy}
      aria-label={label}
      aria-busy={busy}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={(disabled || busy ? rewardClaimButtonDisabled : rewardClaimButton).src}
        alt=""
        aria-hidden="true"
      />
      {busy ? <span className="student-mobile-reward-claim-status">처리 중</span> : null}
    </button>
  );
}
