import "server-only";

type PendingRefresh<T> = {
  loader: () => Promise<T>;
  queued: boolean;
  promise: Promise<T>;
};
const pending = new Map<string, PendingRefresh<unknown>>();

/**
 * Explicit client reconciliation must not be satisfied by a settled cache in
 * another server process. Coalesce a wave of reads, but retain one trailing
 * read when a new reconciliation arrives during an older database request.
 * Entries are removed after settlement; only immutable shared payloads belong
 * here. Authorization and viewer-specific projection stay in the route.
 */
export function revalidateSnapshot<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = pending.get(key) as PendingRefresh<T> | undefined;
  if (existing) {
    existing.loader = loader;
    existing.queued = true;
    return existing.promise;
  }

  const entry = { loader, queued: false } as PendingRefresh<T>;
  const run = async (): Promise<T> => {
    while (true) {
      entry.queued = false;
      try {
        const value = await entry.loader();
        if (!entry.queued) return value;
      } catch (error) {
        if (!entry.queued) throw error;
      }
    }
  };
  // Register before starting work, including synchronously throwing loaders.
  entry.promise = Promise.resolve().then(run).finally(() => {
    if (pending.get(key) === entry) pending.delete(key);
  });
  pending.set(key, entry as PendingRefresh<unknown>);
  return entry.promise;
}
