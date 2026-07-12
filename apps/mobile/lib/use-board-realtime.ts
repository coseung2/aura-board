import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { apiFetch } from "./api";
import type { BoardDetailResponse } from "./types";

/** A broadcast is an invalidation signal; the API snapshot remains authoritative. */
export const BOARD_REALTIME_EVENTS = [
  "card_changed",
  "board_changed",
  "queue_changed",
] as const;

export const BOARD_REALTIME_DEBOUNCE_MS = 100;
export const BOARD_REALTIME_BACKGROUND_REFRESH_MS = 15_000;
export const BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS = 15_000;

export type BoardRealtimeStatus =
  | "idle"
  | "connecting"
  | "subscribed"
  | "error"
  | "unavailable";

type BroadcastCallback = (payload: unknown) => void;

/** The small part of the Supabase API used by the mobile invalidation channel. */
export interface BoardRealtimeChannel {
  on: (
    type: "broadcast",
    options: { event: string },
    callback: BroadcastCallback,
  ) => unknown;
  subscribe: (callback?: (status: string) => void) => unknown;
}

export interface BoardRealtimeClient {
  channel: (name: string) => BoardRealtimeChannel;
  removeChannel: (channel: BoardRealtimeChannel) => Promise<unknown> | unknown;
}

export interface BoardRealtimeSubscriber {
  onEvent: () => void;
  onStatus: (status: BoardRealtimeStatus) => void;
}

export interface BoardRealtimeSubscription {
  status: BoardRealtimeStatus;
  unsubscribe: () => void;
}

interface BoardRealtimeEntry {
  channel: BoardRealtimeChannel;
  subscribers: Set<BoardRealtimeSubscriber>;
  status: BoardRealtimeStatus;
  removed: boolean;
}

/**
 * Make a ref-counted board channel registry. Keeping this pure (the client is
 * injected) makes channel lifecycle behavior straightforward to test without
 * mounting React Native components.
 */
export function createBoardRealtimeRegistry(
  client: BoardRealtimeClient,
): {
  subscribe: (
    slug: string,
    subscriber: BoardRealtimeSubscriber,
  ) => BoardRealtimeSubscription;
  getEntryCount: () => number;
  reset: () => void;
} {
  const entries = new Map<string, BoardRealtimeEntry>();

  const notifyStatus = (
    entry: BoardRealtimeEntry,
    status: BoardRealtimeStatus,
  ) => {
    if (entry.removed || entry.status === status) return;
    entry.status = status;
    for (const subscriber of entry.subscribers) {
      subscriber.onStatus(status);
    }
  };

  const statusFromSupabase = (status: string): BoardRealtimeStatus | null => {
    switch (status.toUpperCase()) {
      case "SUBSCRIBED":
        return "subscribed";
      case "CHANNEL_ERROR":
      case "TIMED_OUT":
      case "CLOSED":
        return "error";
      case "JOINING":
      case "RECONNECTING":
        return "connecting";
      default:
        return null;
    }
  };

  const removeEntry = (slug: string, entry: BoardRealtimeEntry) => {
    if (entry.removed) return;
    entry.removed = true;
    if (entries.get(slug) === entry) entries.delete(slug);
    try {
      // `removeChannel` is intentionally called here, and only here: once the
      // final component releases the board subscription.
      void Promise.resolve(client.removeChannel(entry.channel)).catch(() => undefined);
    } catch {
      // Cleanup must never make an unmount fail.
    }
  };

  const subscribe = (
    slug: string,
    subscriber: BoardRealtimeSubscriber,
  ): BoardRealtimeSubscription => {
    if (!slug) {
      subscriber.onStatus("idle");
      return { status: "idle", unsubscribe: () => {} };
    }

    let entry = entries.get(slug);
    if (!entry) {
      let channel: BoardRealtimeChannel;
      try {
        channel = client.channel(`board:${slug}`);
      } catch {
        subscriber.onStatus("error");
        return { status: "error", unsubscribe: () => {} };
      }
      entry = {
        channel,
        subscribers: new Set<BoardRealtimeSubscriber>(),
        status: "connecting",
        removed: false,
      };
      entries.set(slug, entry);

      // Add the first subscriber before subscribing. Supabase normally calls
      // the status callback asynchronously, but this also handles test/fake
      // channels that invoke it synchronously.
      entry.subscribers.add(subscriber);
      const currentEntry = entry;
      try {
        for (const event of BOARD_REALTIME_EVENTS) {
          channel.on("broadcast", { event }, () => {
            if (currentEntry.removed) return;
            for (const current of currentEntry.subscribers) current.onEvent();
          });
        }
        channel.subscribe((status) => {
          if (currentEntry.removed) return;
          const nextStatus = statusFromSupabase(status);
          if (nextStatus) notifyStatus(currentEntry, nextStatus);
        });
      } catch {
        notifyStatus(currentEntry, "error");
      }
    } else {
      entry.subscribers.add(subscriber);
    }

    // A second subscriber must observe the current channel status, but joining
    // an already subscribed channel must never trigger an initial reload.
    subscriber.onStatus(entry.status);
    let active = true;
    return {
      status: entry.status,
      unsubscribe: () => {
        if (!active) return;
        active = false;
        entry?.subscribers.delete(subscriber);
        if (entry && entry.subscribers.size === 0) removeEntry(slug, entry);
      },
    };
  };

  const reset = () => {
    for (const [slug, entry] of entries) {
      entry.subscribers.clear();
      removeEntry(slug, entry);
    }
  };

  return {
    subscribe,
    getEntryCount: () => entries.size,
    reset,
  };
}

export interface ReloadRunner {
  reload: (delayMs?: number) => void;
  dispose: () => void;
}

/**
 * Per-component trailing debounce and in-flight dedupe for snapshot reloads.
 * A queued invalidation is retained while a request is in flight, so a burst
 * cannot be lost even when the server response is slow.
 */
export function createReloadRunner(
  onReload: () => Promise<void> | void,
  options: { debounceMs?: number } = {},
): ReloadRunner {
  const debounceMs = options.debounceMs ?? BOARD_REALTIME_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let queued = false;
  let disposed = false;

  const flush = () => {
    if (disposed || inFlight || !queued) return;
    queued = false;
    let request: Promise<void>;
    request = Promise.resolve()
      .then(() => onReload())
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        if (inFlight === request) inFlight = null;
        if (!disposed && queued) queueMicrotask(flush);
      });
    inFlight = request;
  };

  const reload = (delayMs = debounceMs) => {
    if (disposed) return;
    queued = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, Math.max(0, delayMs));
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    queued = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { reload, dispose };
}

/** DJQueue uses a low-frequency snapshot fallback until realtime is healthy. */
export function shouldUseBoardFallbackPolling(
  status: BoardRealtimeStatus,
): boolean {
  return status !== "subscribed";
}

let moduleSupabaseClient: BoardRealtimeClient | null = null;
let clientInitAttempted = false;
let moduleRegistry: ReturnType<typeof createBoardRealtimeRegistry> | null = null;
let moduleRegistryClient: BoardRealtimeClient | null = null;

function getModuleSupabaseClient(): BoardRealtimeClient | null {
  if (clientInitAttempted) return moduleSupabaseClient;
  clientInitAttempted = true;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    // Keep this runtime-safe for Expo bundles where an optional native build
    // may omit the package. The dependency is present in normal app builds.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@supabase/supabase-js");
    const createClient = (mod?.createClient ?? mod?.default?.createClient) as
      | ((supabaseUrl: string, supabaseKey: string, options: object) => unknown)
      | undefined;
    if (!createClient) return null;
    moduleSupabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as BoardRealtimeClient;
  } catch {
    moduleSupabaseClient = null;
  }
  return moduleSupabaseClient;
}

function getModuleRegistry(): ReturnType<typeof createBoardRealtimeRegistry> | null {
  const client = getModuleSupabaseClient();
  if (!client) return null;
  if (!moduleRegistry || moduleRegistryClient !== client) {
    moduleRegistry = createBoardRealtimeRegistry(client);
    moduleRegistryClient = client;
  }
  return moduleRegistry;
}

/** Reset singleton state for isolated unit tests; app code never needs this. */
export function resetBoardRealtimeForTests() {
  moduleRegistry?.reset();
  moduleRegistry = null;
  moduleRegistryClient = null;
  moduleSupabaseClient = null;
  clientInitAttempted = false;
}

/**
 * Subscribe to one board's broadcast invalidation channel. Broadcast remains
 * only a signal: every reload fetches the authoritative server snapshot.
 */
export function useBoardRealtime({
  slug,
  onReload,
}: {
  slug: string;
  onReload: () => Promise<void> | void;
}): { reload: (delayMs?: number) => void; status: BoardRealtimeStatus } {
  const [status, setStatus] = useState<BoardRealtimeStatus>("idle");
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const runnerRef = useRef<ReloadRunner | null>(null);
  const slugRef = useRef(slug);
  slugRef.current = slug;

  const reload = useCallback((delayMs?: number) => {
    if (!slugRef.current) return;
    runnerRef.current?.reload(delayMs);
  }, []);

  useEffect(() => {
    if (!slug) {
      setStatus("idle");
      runnerRef.current = null;
      return;
    }

    let cancelled = false;
    const runner = createReloadRunner(() => reloadRef.current());
    runnerRef.current = runner;
    setStatus("connecting");

    const registry = getModuleRegistry();
    const subscription = registry
      ? registry.subscribe(slug, {
          onEvent: () => runner.reload(),
          onStatus: (nextStatus) => {
            if (!cancelled) setStatus(nextStatus);
          },
        })
      : {
          status: "unavailable" as const,
          unsubscribe: () => {},
        };
    if (!cancelled) setStatus(subscription.status);

    let backgroundedAt: number | null = null;
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (cancelled) return;
        if (nextState === "active") {
          const backgroundDuration = backgroundedAt
            ? Date.now() - backgroundedAt
            : 0;
          backgroundedAt = null;
          if (backgroundDuration >= BOARD_REALTIME_BACKGROUND_REFRESH_MS) {
            runner.reload();
          }
        } else if (backgroundedAt === null) {
          backgroundedAt = Date.now();
        }
      },
    );

    return () => {
      cancelled = true;
      runner.dispose();
      if (runnerRef.current === runner) runnerRef.current = null;
      appStateSubscription.remove();
      subscription.unsubscribe();
    };
  }, [slug, reload]);

  return { reload, status };
}

export async function fetchStudentBoard(slug: string): Promise<BoardDetailResponse> {
  return apiFetch<BoardDetailResponse>(`/api/student/board/${encodeURIComponent(slug)}`);
}
