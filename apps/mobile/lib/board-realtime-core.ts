/** Broadcast invalidates state; authenticated HTTP snapshots remain authoritative. */
export const BOARD_REALTIME_EVENTS = ["card_changed", "board_changed", "queue_changed", "play_session_changed", "omok_matchmaking_changed"] as const;
export const BOARD_REALTIME_DEBOUNCE_MS = 100;
export const BOARD_REALTIME_BACKGROUND_REFRESH_MS = 15_000;
export const BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS = 15_000;
export type BoardRealtimeStatus = "idle" | "connecting" | "subscribed" | "error" | "unavailable";
export interface BoardRealtimeChannel {
  on: (type: "broadcast", options: { event: string }, callback: (payload: unknown) => void) => unknown;
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
type Entry = { channel: BoardRealtimeChannel; subscribers: Set<BoardRealtimeSubscriber>; status: BoardRealtimeStatus; removed: boolean };

/** One physical board channel, removed only when the last consumer releases it. */
export function createBoardRealtimeRegistry(client: BoardRealtimeClient) {
  const entries = new Map<string, Entry>();
  function notifyStatus(entry: Entry, status: BoardRealtimeStatus) {
    if (entry.removed || entry.status === status) return;
    entry.status = status;
    for (const subscriber of entry.subscribers) subscriber.onStatus(status);
  }
  function removeEntry(slug: string, entry: Entry) {
    if (entry.removed) return;
    entry.removed = true;
    if (entries.get(slug) === entry) entries.delete(slug);
    try { void Promise.resolve(client.removeChannel(entry.channel)).catch(() => undefined); } catch { /* cleanup */ }
  }
  function subscribe(slug: string, subscriber: BoardRealtimeSubscriber): BoardRealtimeSubscription {
    if (!slug) { subscriber.onStatus("idle"); return { status: "idle", unsubscribe: () => {} }; }
    let entry = entries.get(slug);
    if (!entry) {
      let channel: BoardRealtimeChannel;
      try { channel = client.channel(`board:${slug}`); }
      catch { subscriber.onStatus("error"); return { status: "error", unsubscribe: () => {} }; }
      entry = { channel, subscribers: new Set([subscriber]), status: "connecting", removed: false };
      entries.set(slug, entry);
      const current = entry;
      try {
        for (const event of BOARD_REALTIME_EVENTS) {
          channel.on("broadcast", { event }, () => {
            if (!current.removed) for (const listener of current.subscribers) listener.onEvent();
          });
        }
        channel.subscribe((status) => {
          switch (status.toUpperCase()) {
            case "SUBSCRIBED": notifyStatus(current, "subscribed"); break;
            case "CHANNEL_ERROR": case "TIMED_OUT": case "CLOSED": notifyStatus(current, "error"); break;
            case "JOINING": case "RECONNECTING": notifyStatus(current, "connecting"); break;
          }
        });
      } catch { notifyStatus(current, "error"); }
    } else entry.subscribers.add(subscriber);
    subscriber.onStatus(entry.status);
    let active = true;
    return {
      status: entry.status,
      unsubscribe: () => {
        if (!active) return;
        active = false;
        entry.subscribers.delete(subscriber);
        if (entry.subscribers.size === 0) removeEntry(slug, entry);
      },
    };
  }
  return {
    subscribe,
    getEntryCount: () => entries.size,
    reset: () => { for (const [slug, entry] of entries) { entry.subscribers.clear(); removeEntry(slug, entry); } },
  };
}

export interface ReloadRunner { reload: (delayMs?: number) => void; dispose: () => void; }

/** Coalesced refreshes retain invalidations received during an in-flight read.
 * A bounded window prevents a continuous classroom event stream starving UI. */
export function createReloadRunner(onReload: () => Promise<void> | void, options: { debounceMs?: number } = {}): ReloadRunner {
  const debounceMs = options.debounceMs ?? BOARD_REALTIME_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let queued = false;
  let disposed = false;
  function clearTimers() {
    if (timer) clearTimeout(timer);
    if (deadline) clearTimeout(deadline);
    timer = null; deadline = null;
  }
  function flush() {
    clearTimers();
    if (disposed || inFlight || !queued) return;
    queued = false;
    const request = Promise.resolve().then(() => { if (!disposed) return onReload(); }).then(() => undefined).catch(() => undefined).finally(() => {
      if (inFlight === request) inFlight = null;
      if (!disposed && queued) queueMicrotask(flush);
    });
    inFlight = request;
  }
  return {
    reload: (delayMs = debounceMs) => {
      if (disposed) return;
      queued = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, Math.max(0, delayMs));
      if (!deadline) deadline = setTimeout(flush, Math.max(500, debounceMs));
    },
    dispose: () => { disposed = true; queued = false; clearTimers(); },
  };
}

export function shouldUseBoardFallbackPolling(status: BoardRealtimeStatus): boolean { return status !== "subscribed"; }
