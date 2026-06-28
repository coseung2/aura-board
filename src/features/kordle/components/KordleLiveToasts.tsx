"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  boardId: string;
};

type LiveEvent = {
  id: string;
  name: string;
  correctCount: number;
  createdAt: string;
};

type FeedResponse = {
  events: LiveEvent[];
  serverTime: string;
};

export function KordleLiveToasts({ boardId }: Props) {
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const seenIds = useRef(new Set<string>());
  const sinceRef = useRef(new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/kordle/boards/${boardId}/feed?since=${encodeURIComponent(sinceRef.current)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as FeedResponse;
          sinceRef.current = data.serverTime;
          const fresh = data.events.filter((event) => !seenIds.current.has(event.id));
          for (const event of fresh) seenIds.current.add(event.id);
          if (!cancelled && fresh.length > 0) {
            setToasts((current) => [...fresh, ...current].slice(0, 4));
            window.setTimeout(() => {
              setToasts((current) =>
                current.filter((toast) => !fresh.some((event) => event.id === toast.id)),
              );
            }, 4200);
          }
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, 2200);
        }
      }
    }

    timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [boardId]);

  if (toasts.length === 0) return null;

  return (
    <div className="kordle-live-toasts" aria-live="polite" aria-label="꼬들 라이브 알림">
      {toasts.map((toast) => (
        <div className="kordle-live-toast" key={toast.id}>
          <strong>{toast.name}님</strong>
          <span>{toast.correctCount}글자 맞추셨습니다.</span>
        </div>
      ))}
    </div>
  );
}
