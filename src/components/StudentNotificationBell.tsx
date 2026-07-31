"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type StudentNotificationItem = {
  id: string;
  kind: "like" | "comment" | "reward" | "refund" | "attendance" | "assignment";
  actorLabel: string;
  cardTitle: string;
  boardTitle: string;
  href: string;
  createdAt: string;
  content?: string;
  read: boolean;
};

type Payload = {
  count: number;
  items: StudentNotificationItem[];
};

const NOTIFICATION_STALE_MS = 60_000;

export function StudentNotificationBell() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const lastLoadedAtRef = useRef(0);
  const mountedRef = useRef(true);

  const load = useCallback((): Promise<void> => {
    const existing = loadInFlightRef.current;
    if (existing) return existing;

    const request = (async () => {
      try {
        const res = await fetch("/api/student/notifications", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as Payload;
        if (!mountedRef.current) return;
        setPayload(data);
        lastLoadedAtRef.current = Date.now();
      } catch {
        /* retry on the next open or stale visibility/focus check */
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
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const count = payload?.count ?? 0;
  const items = payload?.items ?? [];

  function markRead(item: StudentNotificationItem) {
    if (item.read) return;
    const sourceId = item.id.slice(`${item.kind}:`.length);
    setPayload((current) =>
      current
        ? {
            count: Math.max(0, current.count - 1),
            items: current.items.map((currentItem) =>
              currentItem.id === item.id ? { ...currentItem, read: true } : currentItem,
            ),
          }
        : current,
    );
    void fetch("/api/student/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", kind: item.kind, id: sourceId }),
      keepalive: true,
    });
  }

  async function markAllRead() {
    if (markingAll || count === 0) return;
    setMarkingAll(true);
    try {
      const res = await fetch("/api/student/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!res.ok) return;
      setPayload((current) =>
        current
          ? { count: 0, items: current.items.map((item) => ({ ...item, read: true })) }
          : current,
      );
    } finally {
      setMarkingAll(false);
    }
  }

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
        <div className="auth-notify-header">
          <span>알림</span>
          {count > 0 && (
            <button
              type="button"
              className="auth-notify-mark-all"
              onClick={() => void markAllRead()}
              disabled={markingAll}
              role="menuitem"
            >
              {markingAll ? "처리 중" : "전체 읽음"}
            </button>
          )}
        </div>
        {payload === null ? (
          <div className="auth-notify-empty">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="auth-notify-empty">새 알림이 없어요.</div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`auth-notify-item${item.read ? " is-read" : ""}`}
              role="menuitem"
              onClick={() => {
                markRead(item);
                setOpen(false);
              }}
            >
              <div className="auth-notify-item-title">
                {notificationTitle(item)}
              </div>
              {item.content && (
                <div className="auth-notify-item-body">{item.content}</div>
              )}
              <div className="auth-notify-item-meta">
                {notificationMeta(item)}
              </div>
            </Link>
          ))
        )}
      </div>
    </details>
  );
}

function notificationTitle(item: StudentNotificationItem): string {
  if (item.kind === "like") return `${item.actorLabel}님이 좋아요를 눌렀어요.`;
  if (item.kind === "comment") return `${item.actorLabel}님이 댓글을 남겼어요.`;
  if (item.kind === "reward") return `${item.cardTitle || "보상"}을 받았어요.`;
  // The refund title already reads as a sentence, so it is not re-wrapped.
  if (item.kind === "refund") return item.cardTitle || "돌려받은 금액이 있어요.";
  return item.cardTitle || (item.kind === "attendance" ? "출석 알림" : "과제 알림");
}

function notificationMeta(item: StudentNotificationItem): string {
  const relative = formatRelative(item.createdAt);
  if (item.kind === "reward") return `${item.boardTitle || "내 통장"} · ${relative}`;
  if (item.kind === "refund") return `${item.actorLabel || "펫 상점"} · ${relative}`;
  if (item.kind === "attendance" || item.kind === "assignment") {
    return `${item.boardTitle || (item.kind === "attendance" ? "출석" : "과제")} · ${relative}`;
  }
  return `${item.cardTitle || "제목 없는 카드"} · ${item.boardTitle} · ${relative}`;
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
