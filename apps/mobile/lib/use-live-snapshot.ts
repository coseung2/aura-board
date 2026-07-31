import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getMobileRealtimeClient,
  type BoardRealtimeChannel,
  type BoardRealtimeStatus,
} from "./use-board-realtime";

export const LIVE_SNAPSHOT_FALLBACK_BASE_MS = 15_000;
export const LIVE_SNAPSHOT_FALLBACK_MAX_MS = 60_000;

export function liveSnapshotFallbackDelay(failures: number): number {
  const exponent = Math.max(0, Math.min(2, failures));
  return Math.min(
    LIVE_SNAPSHOT_FALLBACK_MAX_MS,
    LIVE_SNAPSHOT_FALLBACK_BASE_MS * 2 ** exponent,
  );
}

export function shouldScheduleLiveSnapshotFallback({
  active,
  enabled,
  status,
  terminal,
}: {
  active: boolean;
  enabled: boolean;
  status: BoardRealtimeStatus;
  terminal: boolean;
}): boolean {
  return active && enabled && !terminal && status !== "subscribed";
}

type Options = {
  channelName: string;
  events: readonly string[];
  enabled?: boolean;
  terminal?: boolean;
  reload: () => Promise<void>;
};

/**
 * Broadcast only invalidates local state. HTTP remains authoritative for the
 * initial read, every broadcast, foreground catch-up, and reconnect catch-up.
 */
export function useLiveSnapshot({
  channelName,
  events,
  enabled = true,
  terminal = false,
  reload,
}: Options): BoardRealtimeStatus {
  const [status, setStatus] = useState<BoardRealtimeStatus>("idle");
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const eventsKey = JSON.stringify(events);

  useEffect(() => {
    if (!enabled || terminal || !channelName) {
      setStatus("idle");
      return;
    }

    let stopped = false;
    let active = AppState.currentState === "active";
    let currentStatus: BoardRealtimeStatus = "connecting";
    let hasSubscribed = false;
    let failures = 0;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;
    let queued = false;
    let channel: BoardRealtimeChannel | null = null;
    const client = getMobileRealtimeClient();

    const clearFallback = () => {
      if (!fallbackTimer) return;
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    };

    const updateStatus = (nextStatus: BoardRealtimeStatus) => {
      currentStatus = nextStatus;
      if (!stopped) setStatus(nextStatus);
    };

    const scheduleFallback = () => {
      clearFallback();
      if (
        stopped ||
        !shouldScheduleLiveSnapshotFallback({
          active,
          enabled,
          status: currentStatus,
          terminal,
        })
      ) {
        return;
      }
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        void runRefresh();
      }, liveSnapshotFallbackDelay(failures));
    };

    const runRefresh = (): Promise<void> => {
      if (stopped) return Promise.resolve();
      if (inFlight) {
        queued = true;
        return inFlight;
      }

      let request!: Promise<void>;
      request = Promise.resolve()
        .then(() => reloadRef.current())
        .then(() => {
          failures = 0;
        })
        .catch(() => {
          failures += 1;
        })
        .finally(() => {
          if (inFlight === request) inFlight = null;
          if (stopped) return;
          if (queued && active) {
            queued = false;
            void runRefresh();
            return;
          }
          queued = false;
          scheduleFallback();
        });
      inFlight = request;
      return request;
    };

    updateStatus(client ? "connecting" : "unavailable");

    if (client) {
      try {
        channel = client.channel(channelName);
        for (const event of JSON.parse(eventsKey) as string[]) {
          channel.on("broadcast", { event }, () => {
            if (stopped || !active) return;
            void runRefresh();
          });
        }
        channel.subscribe((nextStatus) => {
          if (stopped) return;
          const normalized = nextStatus.toUpperCase();
          if (normalized === "SUBSCRIBED") {
            const reconnecting = hasSubscribed || currentStatus === "error";
            hasSubscribed = true;
            updateStatus("subscribed");
            clearFallback();
            if (reconnecting && active) void runRefresh();
          } else if (
            normalized === "CHANNEL_ERROR" ||
            normalized === "TIMED_OUT" ||
            normalized === "CLOSED"
          ) {
            updateStatus("error");
            scheduleFallback();
          } else if (
            normalized === "JOINING" ||
            normalized === "RECONNECTING"
          ) {
            updateStatus("connecting");
            scheduleFallback();
          }
        });
      } catch {
        updateStatus("error");
      }
    }

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (stopped) return;
      const wasActive = active;
      active = nextState === "active";
      if (!active) {
        clearFallback();
      } else if (!wasActive) {
        void runRefresh();
      }
    });

    // The only initial snapshot request for this channel generation.
    void runRefresh();

    return () => {
      stopped = true;
      queued = false;
      clearFallback();
      appStateSubscription.remove();
      if (client && channel) {
        try {
          void Promise.resolve(client.removeChannel(channel)).catch(() => undefined);
        } catch {
          // Cleanup should not make unmount fail.
        }
      }
    };
  }, [channelName, enabled, eventsKey, terminal]);

  return status;
}
