"use client";

type Props = {
  reason: string;
};

export function ReturnReasonBanner({ reason }: Props) {
  return (
    <div className="assign-return-banner" role="alert">
      <span className="assign-return-banner__icon" aria-hidden="true">
        !
      </span>
      <div className="assign-return-banner__body">
        <div className="assign-return-banner__title">반려됨 - 재제출 필요</div>
        <div className="assign-return-banner__reason">{reason}</div>
      </div>
    </div>
  );
}
