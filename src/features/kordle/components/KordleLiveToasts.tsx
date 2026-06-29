"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  boardId: string;
};

type LiveEvent = {
  id: string;
  name: string;
  guessIndex: number;
  correctCount: number;
  createdAt: string;
};

type FeedResponse = {
  events: LiveEvent[];
  serverTime: string;
};

export function KordleLiveToasts({ boardId }: Props) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
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
            setEvents((current) => [[...fresh].reverse(), current].flat().slice(0, 12));
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

  if (events.length === 0) return null;

  return (
    <aside className="kordle-live-toasts" aria-live="polite" aria-label="꼬들 라이브 피드">
      <div className="kordle-live-feed-head">실시간 제출</div>
      {events.map((event) => (
        <div className="kordle-live-toast" key={event.id}>
          <strong>{event.name}님</strong>
          <span>
            {event.guessIndex}줄에서 {event.correctCount}글자 맞춤
          </span>
        </div>
      ))}
    </aside>
  );
}
