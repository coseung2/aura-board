export type TrailingRefreshRunner = {
  run: () => Promise<void>;
  isRunning: () => boolean;
};

/**
 * Collapse concurrent invalidations into the current refresh plus at most one
 * trailing refresh. The trailing run is important for realtime transports:
 * an event received while the snapshot request is in flight may represent a
 * later committed state and must not be dropped.
 */
export function createTrailingRefreshRunner(
  refresh: () => Promise<void>,
): TrailingRefreshRunner {
  let inflight: Promise<void> | null = null;
  let queued = false;

  const run = (): Promise<void> => {
    if (inflight) {
      queued = true;
      return inflight;
    }

    const request = Promise.resolve()
      .then(refresh)
      .catch(() => {
        // A failed reconciliation is non-fatal. The next broadcast, focus,
        // network restore, or fallback poll will retry.
      })
      .finally(() => {
        if (inflight === request) inflight = null;
        if (queued) {
          queued = false;
          queueMicrotask(() => {
            void run();
          });
        }
      });

    inflight = request;
    return request;
  };

  return {
    run,
    isRunning: () => inflight !== null,
  };
}
