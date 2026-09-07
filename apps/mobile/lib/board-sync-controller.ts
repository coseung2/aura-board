import { createReloadRunner, type BoardRealtimeStatus, type BoardRealtimeSubscriber, type BoardRealtimeSubscription } from "./board-realtime-core";

type Options = {
  subscribe: (subscriber: BoardRealtimeSubscriber) => Promise<BoardRealtimeSubscription | null>;
  onReload: () => Promise<void> | void;
  onStatus: (status: BoardRealtimeStatus) => void;
  active?: boolean;
  fallbackPollMs?: number;
  reconnectMs?: number;
};

/** Lifecycle is independent of React Native, so reconnect/background races
 * can be exercised with real promises and fake clocks rather than source scans. */
export function createBoardSyncController({ subscribe, onReload, onStatus, active = true, fallbackPollMs = 0, reconnectMs = 15_000 }: Options) {
  let disposed = false;
  let status: BoardRealtimeStatus = "connecting";
  let subscription: BoardRealtimeSubscription | null = null;
  let connecting = false;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  const runner = createReloadRunner(async () => {
    if (disposed || !active) return;
    try {
      await onReload();
      failures = 0;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
    } catch (error) {
      if (!disposed && active && !recoveryTimer) {
        recoveryTimer = setTimeout(() => {
          recoveryTimer = null;
          reload(0);
        }, Math.min(15_000, 1_000 * 2 ** Math.min(failures++, 4)));
      }
      throw error;
    }
  });

  function reload(delayMs?: number) {
    if (!disposed && active) runner.reload(delayMs);
    // Every foreground transition reconciles, including events missed while
    // inactive; no duration threshold can suppress a short-background update.
  }

  function clearTimers() {
    if (fallbackTimer) clearInterval(fallbackTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (recoveryTimer) clearTimeout(recoveryTimer);
    fallbackTimer = null; reconnectTimer = null; recoveryTimer = null;
  }

  function syncTimers() {
    if (disposed || !active) { clearTimers(); return; }
    if (status === "subscribed") {
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      fallbackTimer = null; reconnectTimer = null;
    } else if (fallbackPollMs > 0 && !fallbackTimer) {
      fallbackTimer = setInterval(() => reload(0), fallbackPollMs);
    }
    if (!subscription && !connecting && !reconnectTimer) {
      reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect(); }, reconnectMs);
    }
  }

  function updateStatus(next: BoardRealtimeStatus) {
    if (disposed) return;
    const becameSubscribed = next === "subscribed" && status !== "subscribed";
    status = next;
    onStatus(next);
    if (becameSubscribed) reload(0);
    syncTimers();
  }

  async function connect() {
    if (disposed || !active || subscription || connecting) return;
    connecting = true;
    try {
      const result = await subscribe({ onEvent: () => reload(), onStatus: updateStatus });
      if (disposed) { result?.unsubscribe(); return; }
      subscription = result;
      updateStatus(result?.status ?? "unavailable");
      if (result?.status === "error") {
        result.unsubscribe();
        subscription = null;
      }
    } catch {
      updateStatus("error");
    } finally {
      connecting = false;
      syncTimers();
    }
  }

  onStatus(status);
  void connect();
  syncTimers();
  return {
    reload,
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      syncTimers();
      if (active) {
        reload(0);
        if (status === "error") { subscription?.unsubscribe(); subscription = null; }
        void connect();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimers();
      runner.dispose();
      subscription?.unsubscribe();
      subscription = null;
    },
  };
}
