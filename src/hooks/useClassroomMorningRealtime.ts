"use client";

import { useEffect, useRef } from "react";
import {
  classroomMorningChannelKey,
  type ClassroomMorningRealtimeEvent,
} from "@/lib/realtime";
import type { PublicSupabaseClient } from "@/lib/supabase/client";

type Options = {
  classroomId: string;
  onRefresh: () => Promise<void>;
};

type MorningRealtimeChannel = ReturnType<PublicSupabaseClient["channel"]>;

const EVENT_COALESCE_MS = 80;

export function useClassroomMorningRealtime({
  classroomId,
  onRefresh,
}: Options): void {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inflight: Promise<void> | null = null;
    let refreshQueued = false;
    let supabase: PublicSupabaseClient | null = null;
    let channel: MorningRealtimeChannel | null = null;

    function requestRefresh() {
      if (stopped) return;
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

    function runRefresh() {
      if (stopped) return;
      if (inflight) {
        refreshQueued = true;
        return;
      }

      const request = refreshRef
        .current()
        .catch((error) => {
          console.error("[classroom morning realtime refresh]", error);
        })
        .finally(() => {
          if (inflight === request) inflight = null;
          if (refreshQueued && !stopped) {
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
            const event = payload as Partial<ClassroomMorningRealtimeEvent>;
            if (
              event.type !== "morning_changed" ||
              event.classroomId !== classroomId
            ) {
              return;
            }
            requestRefresh();
          })
          .subscribe();
      } catch (error) {
        console.error("[classroom morning realtime subscribe]", error);
      }
    })();

    return () => {
      stopped = true;
      refreshQueued = false;
      if (timer) clearTimeout(timer);
      if (supabase && channel) {
        void supabase.removeChannel(channel).catch(() => undefined);
      }
    };
  }, [classroomId]);
}
