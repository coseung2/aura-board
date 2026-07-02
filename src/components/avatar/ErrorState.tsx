"use client";

type Props = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="avatar-state is-error" role="alert">
      <p className="avatar-state-message">{message}</p>
      {onRetry && (
        <button type="button" className="avatar-btn avatar-btn-secondary" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
