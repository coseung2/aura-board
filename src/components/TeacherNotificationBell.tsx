"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface NotificationItem {
  linkId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
  parentEmail: string;
  parentName: string;
  requestedAt: string;
}

type NotificationPayload = {
  items: NotificationItem[];
  total?: number;
};

const NOTIFICATION_STALE_MS = 60_000;

export function TeacherNotificationBell() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const lastLoadedAtRef = useRef(0);
  const mountedRef = useRef(true);

  const load = useCallback((): Promise<void> => {
    const existing = loadInFlightRef.current;
    if (existing) return existing;

    const request = (async () => {
      try {
        const res = await fetch("/api/teacher/notifications", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as NotificationPayload;
        if (!mountedRef.current) return;
        setItems(data.items);
        setTotal(typeof data.total === "number" ? data.total : data.items.length);
        lastLoadedAtRef.current = Date.now();
      } catch {
        /* network/transient: retry on the next open or stale check */
      }
    })();

    loadInFlightRef.current = request;
    request.then(
      () => {
        if (loadInFlightRef.current === request) loadInFlightRef.current = null;
      },
      () => {
        if (loadInFlightRef.current === request) loadInFlightRef.current = null;
      },
    );
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadedAtRef.current < NOTIFICATION_STALE_MS) return;
      void load();
    };

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (detailsRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const count = total ?? items?.length ?? 0;

  return (
    <details
      ref={detailsRef}
      className="auth-notify"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen) void load();
      }}
    >
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
          <div className="auth-notify-empty">새 요청이 없어요.</div>
        ) : (
          items.map((item) => (
            <Link
              key={item.linkId}
              href={`/classroom/${item.classroomId}/parent-access`}
              className="auth-notify-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <div className="auth-notify-item-title">
                {item.studentName} 학부모 승인 대기
              </div>
              <div className="auth-notify-item-meta">
                {item.classroomName} · {formatRelative(item.requestedAt)}
              </div>
            </Link>
          ))
        )}
      </div>
    </details>
  );
}

function formatRelative(iso: string): string {
  const time = new Date(iso);
  const diffMin = Math.floor((Date.now() - time.getTime()) / 60_000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hour = Math.floor(diffMin / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  return `${day}일 전`;
}
