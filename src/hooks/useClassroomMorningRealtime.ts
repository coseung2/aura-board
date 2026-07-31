"use client";

import { useEffect, useRef } from "react";
import {
  classroomMorningChannelKey,
  type ClassroomMorningRealtimeEvent,
} from "@/lib/realtime";
import type { PublicSupabaseClient } from "@/lib/supabase/client";

type Options = {
  classroomId: string;
  onRefresh: (event?: ClassroomMorningRealtimeEvent) => Promise<void>;
};

type MorningRealtimeChannel = ReturnType<PublicSupabaseClient["channel"]>;

const EVENT_COALESCE_MS = 80;
const FALLBACK_REFRESH_MS = 60_000;

const MORNING_CHANGE_TYPES = new Set<ClassroomMorningRealtimeEvent["changeType"]>([
  "cleaning_inspection",
  "shoe_inspection",
  "yellow_card",
  "cleaning_duty",
]);

function parseMorningEvent(
  payload: unknown,
  classroomId: string,
): ClassroomMorningRealtimeEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const event = payload as Partial<ClassroomMorningRealtimeEvent>;
  if (
    event.type !== "morning_changed" ||
    event.classroomId !== classroomId ||
    typeof event.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
    typeof event.changeType !== "string" ||
    !MORNING_CHANGE_TYPES.has(event.changeType as ClassroomMorningRealtimeEvent["changeType"])
  ) {
    return null;
  }
  return event as ClassroomMorningRealtimeEvent;
}

export function useClassroomMorningRealtime({
  classroomId,
  onRefresh,
}: Options): void {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let inflight: Promise<void> | null = null;
    let refreshQueued = false;
    let subscribed = false;
    let fullRefreshQueued = false;
    const queuedEvents = new Map<
      string,
      ClassroomMorningRealtimeEvent
    >();
    let supabase: PublicSupabaseClient | null = null;
    let channel: MorningRealtimeChannel | null = null;

    function stopFallback() {
      if (!fallbackTimer) return;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }

    function startFallback() {
      if (stopped || subscribed || fallbackTimer) return;
      fallbackTimer = setInterval(() => {
        if (document.visibilityState === "visible") {
          requestRefresh();
        }
      }, FALLBACK_REFRESH_MS);
    }

    function requestRefresh(event?: ClassroomMorningRealtimeEvent) {
      if (stopped) return;
      if (event) {
        queuedEvents.set(`${event.changeType}:${event.date}`, event);
      } else {
        fullRefreshQueued = true;
      }
      if (inflight) {
        refreshQueued = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        runRefresh();
      }, EVENT_COALESCE_MS);
    }

    function takeNextRefreshEvent(): ClassroomMorningRealtimeEvent | undefined {
      if (fullRefreshQueued) {
        fullRefreshQueued = false;
        return undefined;
      }
      const next = queuedEvents.entries().next().value as
        | [string, ClassroomMorningRealtimeEvent]
        | undefined;
      if (!next) return undefined;
      queuedEvents.delete(next[0]);
      return next[1];
    }

    function runRefresh() {
      if (stopped) return;
      if (inflight) {
        refreshQueued = true;
        return;
      }

      const event = takeNextRefreshEvent();
      const request = refreshRef
        .current(event)
        .catch((error) => {
          console.error("[classroom morning realtime refresh]", error);
        })
        .finally(() => {
          if (inflight === request) inflight = null;
          if (
            (refreshQueued || fullRefreshQueued || queuedEvents.size > 0) &&
            !stopped
          ) {
            refreshQueued = false;
            queueMicrotask(runRefresh);
          }
        });
      inflight = request;
    }

    (async () => {
      try {
        const { createIsolatedPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (stopped) return;

        supabase = createIsolatedPublicSupabaseClient();
        const nextChannel = supabase.channel(
          classroomMorningChannelKey(classroomId),
        );
        channel = nextChannel;
        nextChannel
          .on("broadcast", { event: "morning_changed" }, ({ payload }) => {
            const event = parseMorningEvent(payload, classroomId);
            if (event) requestRefresh(event);
          })
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              subscribed = true;
              stopFallback();
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              subscribed = false;
              startFallback();
              if (document.visibilityState === "visible") requestRefresh();
            }
          });
      } catch (error) {
        console.error("[classroom morning realtime subscribe]", error);
        subscribed = false;
        startFallback();
        if (document.visibilityState === "visible") requestRefresh();
      }
    })();

    function catchUpWhenVisible() {
      if (!subscribed && document.visibilityState === "visible") {
        requestRefresh();
      }
    }

    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);

    return () => {
      stopped = true;
      subscribed = false;
      refreshQueued = false;
      fullRefreshQueued = false;
      queuedEvents.clear();
      if (timer) clearTimeout(timer);
      stopFallback();
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);
      if (supabase && channel) {
        void supabase.removeChannel(channel).catch(() => undefined);
      }
    };
  }, [classroomId]);
}
