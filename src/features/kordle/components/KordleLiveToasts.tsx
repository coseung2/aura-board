"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";
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

  useEffect(() => {
    let cancelled = false;
    let subscribed = false;
    let timer: number | null = null;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;

    function pushFresh(incoming: KordleLiveEvent[]) {
      const fresh = incoming.filter((event) => !seenIds.current.has(event.id));
      for (const event of fresh) seenIds.current.add(event.id);
      if (!cancelled && fresh.length > 0) {
        setEvents((current) => [[...fresh].reverse(), current].flat().slice(0, 18));
      }
    }

    const refreshRunner = createTrailingRefreshRunner(async () => {
      if (cancelled) return;
      const res = await fetch(
        `/api/kordle/boards/${boardId}/feed?since=${encodeURIComponent(sinceRef.current)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as FeedResponse;
        sinceRef.current = data.serverTime;
        pushFresh(data.events);
      }
    });

    function stopFallbackPolling() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleFallbackPolling(delayMs = 2200) {
      if (
        cancelled ||
        subscribed ||
        document.visibilityState !== "visible" ||
        timer !== null
      ) {
        return;
      }
      timer = window.setTimeout(async () => {
        timer = null;
        if (
          cancelled ||
          subscribed ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        await refreshRunner.run();
        scheduleFallbackPolling();
      }, delayMs);
    }

    function reconcileWhenVisible() {
      if (document.visibilityState !== "visible") return;
      void refreshRunner.run();
      if (!subscribed) scheduleFallbackPolling();
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
              if (!payload.isCorrect && payload.correctCount <= 0) return;
              pushFresh([payload]);
            },
          )
          .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              subscribed = true;
              stopFallbackPolling();
              // Reconcile once at the handoff from HTTP fallback to Realtime.
              void refreshRunner.run();
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              subscribed = false;
              scheduleFallbackPolling();
            }
          });
      } catch {
        if (!cancelled) {
          subscribed = false;
          scheduleFallbackPolling();
        }
      }
    }

    scheduleFallbackPolling(1200);
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    void subscribe();
    return () => {
      cancelled = true;
      subscribed = false;
      stopFallbackPolling();
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
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
