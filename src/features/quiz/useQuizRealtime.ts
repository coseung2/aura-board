"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicSupabaseClient } from "@/lib/supabase/client";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";
import {
  QUIZ_SNAPSHOT_EVENT,
  buildQuizPresencePayload,
  countQuizPresence,
  parseQuizRealtimeSnapshot,
  quizChannelKey,
  quizPresenceActorStorageKey,
  type QuizRealtimeSnapshot,
} from "./realtime";

type QuizRealtimeChannel = ReturnType<PublicSupabaseClient["channel"]>;

type Options = {
  quizId: string | null;
  playerId?: string | null;
  onSnapshot: (snapshot: QuizRealtimeSnapshot) => void;
  fallbackPollMs?: number;
};

type Result = {
  onlineCount: number;
  realtimeReady: boolean;
};

/**
 * Quiz transport policy:
 *
 * - compact committed snapshots arrive through Supabase Broadcast;
 * - lobby participant count comes from anonymous Presence;
 * - the HTTP snapshot is used on subscribe/focus/reconnect and as slow polling
 *   only while the channel is unavailable.
 */
export function useQuizRealtime({
  quizId,
  playerId,
  onSnapshot,
  fallbackPollMs = 15_000,
}: Options): Result {
  const [onlineCount, setOnlineCount] = useState(0);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    if (!quizId) {
      setOnlineCount(0);
      setRealtimeReady(false);
      return;
    }

    let stopped = false;
    let subscribed = false;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let presenceTimer: ReturnType<typeof setTimeout> | null = null;
    let supabase: PublicSupabaseClient | null = null;
    let channel: QuizRealtimeChannel | null = null;
    let trackInFlight = false;
    let trackQueued = false;

    const joinedAt = new Date().toISOString();
    const sessionId = createRandomKey("quiz-session");
    const actorKey = playerId
      ? getOrCreateActorKey(quizId, playerId)
      : null;

    const refreshRunner = createTrailingRefreshRunner(async () => {
      if (stopped) return;
      const response = await fetch(`/api/quiz/${quizId}/snapshot`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`quiz snapshot failed: ${response.status}`);
      }
      const snapshot = parseQuizRealtimeSnapshot(await response.json());
      if (!snapshot || snapshot.quizId !== quizId) {
        throw new Error("invalid quiz snapshot");
      }
      onSnapshotRef.current(snapshot);
    });

    function stopFallbackPolling() {
      if (!fallbackTimer) return;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }

    function startFallbackPolling() {
      if (
        stopped ||
        subscribed ||
        fallbackPollMs <= 0 ||
        fallbackTimer
      ) {
        return;
      }
      fallbackTimer = setInterval(() => {
        if (!document.hidden) void refreshRunner.run();
      }, fallbackPollMs);
    }

    function schedulePresenceTrack(delayMs = 80) {
      if (!actorKey || !channel || !subscribed || stopped) return;
      if (trackInFlight) {
        trackQueued = true;
        return;
      }
      if (presenceTimer) clearTimeout(presenceTimer);
      presenceTimer = setTimeout(() => {
        presenceTimer = null;
        void trackPresence();
      }, delayMs);
    }

    async function trackPresence() {
      if (!actorKey || !channel || !subscribed || stopped || trackInFlight) {
        return;
      }
      trackInFlight = true;
      try {
        await channel.track(
          buildQuizPresencePayload({
            actorKey,
            visible: !document.hidden,
            joinedAt,
          }),
        );
      } catch {
        if (!stopped) {
          setRealtimeReady(false);
          startFallbackPolling();
        }
      } finally {
        trackInFlight = false;
        if (trackQueued && !stopped) {
          trackQueued = false;
          schedulePresenceTrack(0);
        }
      }
    }

    (async () => {
      try {
        const { createIsolatedPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (stopped) return;

        supabase = createIsolatedPublicSupabaseClient();
        const nextChannel = supabase.channel(quizChannelKey(quizId), {
          config: { presence: { key: sessionId } },
        });
        channel = nextChannel;

        nextChannel
          .on(
            "broadcast",
            { event: QUIZ_SNAPSHOT_EVENT },
            ({ payload }: { payload: unknown }) => {
              const snapshot = parseQuizRealtimeSnapshot(payload);
              if (!snapshot || snapshot.quizId !== quizId || stopped) return;
              onSnapshotRef.current(snapshot);
            },
          )
          .on("presence", { event: "sync" }, () => {
            if (stopped) return;
            const state = nextChannel.presenceState() as unknown as Record<
              string,
              unknown
            >;
            setOnlineCount(countQuizPresence(state));
          })
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              subscribed = true;
              setRealtimeReady(true);
              stopFallbackPolling();
              schedulePresenceTrack(0);
              void refreshRunner.run();
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              subscribed = false;
              setRealtimeReady(false);
              setOnlineCount(0);
              startFallbackPolling();
              void refreshRunner.run();
            }
          });
      } catch {
        setRealtimeReady(false);
        startFallbackPolling();
        void refreshRunner.run();
      }
    })();

    function catchUpWhenVisible() {
      schedulePresenceTrack(0);
      if (!document.hidden) void refreshRunner.run();
    }

    function catchUpOnNetworkRestore() {
      void refreshRunner.run();
    }

    window.addEventListener("online", catchUpOnNetworkRestore);
    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);

    return () => {
      stopped = true;
      subscribed = false;
      if (presenceTimer) clearTimeout(presenceTimer);
      stopFallbackPolling();
      window.removeEventListener("online", catchUpOnNetworkRestore);
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);
      if (channel && actorKey) {
        void channel.untrack().catch(() => undefined);
      }
      if (supabase && channel) {
        void supabase.removeChannel(channel).catch(() => undefined);
      }
    };
  }, [fallbackPollMs, playerId, quizId]);

  return { onlineCount, realtimeReady };
}

function getOrCreateActorKey(quizId: string, playerId: string): string {
  const key = quizPresenceActorStorageKey(quizId, playerId);
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = createRandomKey("quiz-actor");
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return createRandomKey("quiz-actor");
  }
}

function createRandomKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}-${uuid}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
