"use client";

import { useEffect, useRef } from "react";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";
import { subscribePublicBroadcast } from "@/lib/supabase/realtime-channel-registry";

type Options = {
  channelName: string;
  event: string | string[];
  refresh: () => Promise<void>;
  enabled?: boolean;
  /** False when the caller already owns the initial authoritative request. */
  initialRefresh?: boolean;
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
  initialRefresh = true,
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
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshFailures = 0;
    let unsubscribeRealtime: (() => void) | null = null;

    const runner = createTrailingRefreshRunner(async () => {
      if (stopped) return;
      try {
        await refreshRef.current();
        refreshFailures = 0;
        if (recoveryTimer) clearTimeout(recoveryTimer);
        recoveryTimer = null;
      } catch (error) {
        // A healthy socket must not suppress recovery of a failed HTTP read.
        // No further broadcast is guaranteed after the failed reconciliation.
        if (!stopped && !recoveryTimer) {
          const delay = Math.min(30_000, 1_000 * 2 ** Math.min(refreshFailures++, 5));
          recoveryTimer = setTimeout(() => {
            recoveryTimer = null;
            if (!document.hidden) requestRefresh();
          }, delay);
        }
        throw error;
      }
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
    if (initialRefresh) requestRefresh();

    return () => {
      stopped = true;
      subscribed = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      stopFallbackPolling();
      window.removeEventListener("online", catchUpOnNetworkRestore);
      window.removeEventListener("focus", catchUpWhenVisible);
      document.removeEventListener("visibilitychange", catchUpWhenVisible);
      unsubscribeRealtime?.();
      unsubscribeRealtime = null;
    };
  }, [channelName, debounceMs, enabled, eventsKey, fallbackPollMs, initialRefresh]);
}
