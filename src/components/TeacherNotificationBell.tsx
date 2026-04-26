"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// teacher-notifications (2026-04-26) — 글로벌 TopNav 안의 알림 종.
// 학부모 승인 요청 (ParentChildLink status=pending) 을 모든 학급에서
// 집계해서 보여줌. 60s polling, native <details> 드롭다운.

interface NotificationItem {
  linkId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
  parentEmail: string;
  parentName: string;
  requestedAt: string;
}

export function TeacherNotificationBell() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/teacher/notifications", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setItems(j.items as NotificationItem[]);
      } catch {
        /* network/transient — 다음 주기에 재시도 */
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const count = items?.length ?? 0;

  return (
    <details className="auth-notify">
      <summary
        className="auth-notify-trigger"
        title="알림"
        aria-label={count > 0 ? `알림 ${count}건 열기` : "알림 열기"}
      >
        <span aria-hidden>🔔</span>
        {count > 0 && (
          <span className="auth-notify-badge" aria-hidden>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </summary>
      <div className="auth-notify-panel" role="menu">
        <div className="auth-notify-header">학부모 승인 요청</div>
        {items === null ? (
          <div className="auth-notify-empty">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="auth-notify-empty">새 요청이 없어요</div>
        ) : (
          items.map((it) => (
            <Link
              key={it.linkId}
              href={`/classroom/${it.classroomId}/parent-access`}
              className="auth-notify-item"
              role="menuitem"
            >
              <div className="auth-notify-item-title">
                {it.studentName} 학부모 승인 대기
              </div>
              <div className="auth-notify-item-meta">
                {it.classroomName} · {formatRelative(it.requestedAt)}
              </div>
            </Link>
          ))
        )}
      </div>
    </details>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso);
  const diffMin = Math.floor((Date.now() - t.getTime()) / 60_000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hr = Math.floor(diffMin / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}
