"use client";

export function LoadingState({ message = "불러오는 중…" }: { message?: string }) {
  return (
    <div className="avatar-state">
      <p className="avatar-state-message">{message}</p>
    </div>
  );
}
