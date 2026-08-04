"use client";

import attendanceStamp from "../../../apps/mobile/assets/walking/attendance-stamp.png";
import rewardClaimButtonDisabled from "../../../apps/mobile/assets/walking/reward-claim-button-disabled.png";
import rewardClaimButton from "../../../apps/mobile/assets/walking/reward-claim-button.png";
import rewardCoin from "../../../apps/mobile/assets/walking/reward-coin.png";

const numberFormatter = new Intl.NumberFormat("ko-KR");

export const MOBILE_ATTENDANCE_STAMP_SRC = attendanceStamp.src;

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
