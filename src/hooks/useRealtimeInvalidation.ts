"use client";

import { useEffect, useRef } from "react";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";
import { subscribePublicBroadcast } from "@/lib/supabase/realtime-channel-registry";

type Options = {
  channelName: string;
  event: string | string[];
  refresh: () => Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
  /**
   * Used only while the realtime channel is unavailable. A successful
   * subscription disables the interval, so Broadcast remains the primary
   * transport and Vercel/API polling stays a recovery path.
   */
  fallbackPollMs?: number;
};

/**
 * Board realtime policy for durable application state:
 *
 * - Supabase Broadcast is the fast invalidation signal.
 * - The server snapshot remains the source of truth.
 * - Focus / visibility / network restore reconcile missed events.
 * - Slow polling runs only while Realtime is unavailable.
 *
 * This hook intentionally has no Presence support. Presence belongs to
 * ephemeral game/lobby participation, not ordinary content-board state.
 */
export function useRealtimeInvalidation({
  channelName,
  event,
  refresh,
  enabled = true,
  debounceMs = 80,
  fallbackPollMs = 30_000,
}: Options) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Accept both the original single-event API and a list of broadcast event
  // names. Keeping the key separate from the array identity avoids tearing
  // down/recreating a channel when callers provide an inline array.
  const events = Array.isArray(event) ? event : [event];
  const eventsKey = JSON.stringify(events);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let subscribed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let unsubscribeRealtime: (() => void) | null = null;

    const runner = createTrailingRefreshRunner(async () => {
      if (stopped) return;
      await refreshRef.current();
    });

    function stopFallbackPolling() {
      if (!fallbackTimer) return;
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }

    function startFallbackPolling() {
      if (stopped || subscribed || fallbackPollMs <= 0 || fallbackTimer) return;
      fallbackTimer = setInterval(() => {
        if (!document.hidden) void runner.run();
      }, fallbackPollMs);
    }

    function requestRefresh(delayMs = 0) {
      if (stopped) return;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (delayMs <= 0) {
        void runner.run();
        return;
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void runner.run();
      }, delayMs);
    }

    // Cover the state where subscribe neither succeeds nor reports an error.
    // A successful subscription below stops this timer before its first tick.
    startFallbackPolling();

    unsubscribeRealtime = subscribePublicBroadcast({
      channelName,
      events,
      onMessage: () => requestRefresh(debounceMs),
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          stopFallbackPolling();
          requestRefresh();
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          subscribed = false;
          startFallbackPolling();
          requestRefresh();
        }
      },
    });

    function catchUpWhenVisible() {
      if (!document.hidden) requestRefresh();
    }

    function catchUpOnNetworkRestore() {
      requestRefresh();
    }

    window.addEventListener("online", catchUpOnNetworkRestore);
    window.addEventListener("focus", catchUpWhenVisible);
    document.addEventListener("visibilitychange", catchUpWhenVisible);
    // Reconcile immediately on mount. Realtime is only an invalidation
    // transport; initial board correctness must not wait for its 10s timeout.
    requestRefresh();

    return () => {
      stopped = true;
      subscribed = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      stopFallbackPolling();
      window.removeEventListener("online", catchUpOnNetworkRestore);
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);
      unsubscribeRealtime?.();
      unsubscribeRealtime = null;
    };
  }, [channelName, debounceMs, enabled, eventsKey, fallbackPollMs]);
}
