"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  KORDLE_GUESS_SUBMITTED_EVENT,
  kordleBoardChannelKey,
  type KordleLiveEvent,
} from "../realtime";

type Props = {
  boardId: string;
};

type FeedResponse = {
  events: KordleLiveEvent[];
  serverTime: string;
};

export function KordleLiveToasts({ boardId }: Props) {
  const [events, setEvents] = useState<KordleLiveEvent[]>([]);
  const seenIds = useRef(new Set<string>());
  const sinceRef = useRef(new Date().toISOString());
  const realtimeReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    realtimeReadyRef.current = false;

    function pushFresh(incoming: KordleLiveEvent[]) {
      const fresh = incoming.filter((event) => !seenIds.current.has(event.id));
      for (const event of fresh) seenIds.current.add(event.id);
      if (!cancelled && fresh.length > 0) {
        setEvents((current) => [[...fresh].reverse(), current].flat().slice(0, 18));
      }
    }

    async function poll() {
      try {
        const res = await fetch(
          `/api/kordle/boards/${boardId}/feed?since=${encodeURIComponent(sinceRef.current)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as FeedResponse;
          sinceRef.current = data.serverTime;
          pushFresh(data.events);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, realtimeReadyRef.current ? 30000 : 2200);
        }
      }
    }

    async function subscribe() {
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
        channel = supabase
          .channel(kordleBoardChannelKey(boardId))
          .on(
            "broadcast",
            { event: KORDLE_GUESS_SUBMITTED_EVENT },
            ({ payload }: { payload: KordleLiveEvent }) => {
              if (cancelled || !payload?.id) return;
              sinceRef.current = payload.createdAt;
              pushFresh([payload]);
            },
          )
          .subscribe((status) => {
            realtimeReadyRef.current = status === "SUBSCRIBED";
          });
      } catch {
        realtimeReadyRef.current = false;
      }
    }

    void subscribe();
    timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      if (supabase && channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [boardId]);

  if (events.length === 0) return null;

  return (
    <aside className="kordle-live-toasts" aria-label="꼬들 라이브 채팅">
      <div className="kordle-live-chat-list" role="log" aria-live="polite">
        {[...events].reverse().map((event) => (
          <div
            className={
              event.isCorrect
                ? "kordle-live-toast kordle-live-toast--winner"
                : "kordle-live-toast"
            }
            key={event.id}
          >
            <strong>{event.name}님</strong>
            <span>
              {event.isCorrect ? "정답을 맞췄습니다" : `${event.guessIndex}줄 · ${event.correctCount}글자`}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
