"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Props = {
  pendingCount: number;
};

export function ParentNotificationBell({ pendingCount }: Props) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (detailsRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <details
      ref={detailsRef}
      className="auth-notify"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className="auth-notify-trigger"
        title="알림"
        aria-label={
          pendingCount > 0 ? `알림 ${pendingCount}건 열기` : "알림 열기"
        }
      >
        <span aria-hidden>🔔</span>
        {pendingCount > 0 && (
          <span className="auth-notify-badge" aria-hidden>
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </summary>
      <div className="auth-notify-panel" role="menu">
        <div className="auth-notify-header">알림</div>
        {pendingCount > 0 ? (
          <Link
            href="/parent/home"
            className="auth-notify-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <div className="auth-notify-item-title">
              자녀 연결 승인 대기 {pendingCount}건
            </div>
            <div className="auth-notify-item-meta">
              승인되면 자녀 작품을 볼 수 있어요.
            </div>
          </Link>
        ) : (
          <div className="auth-notify-empty">새 알림이 없어요.</div>
        )}
      </div>
    </details>
  );
}
