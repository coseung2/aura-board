type RequestCacheEntry = {
  value: unknown;
  expiresAt: number;
  lastAccessAt: number;
};

const MAX_REQUEST_CACHE_ENTRIES = 32;
const entries = new Map<string, RequestCacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const forceRevision = new Map<string, number>();
let nextForceRevision = 0;
let cacheGeneration = 0;

export function cachedRequest<T>(options: {
  key: string;
  ttlMs: number;
  force?: boolean;
  loader: () => Promise<T>;
}): Promise<T> {
  const now = Date.now();
  const current = entries.get(options.key);
  if (!options.force && current && current.expiresAt > now) {
    current.lastAccessAt = now;
    return Promise.resolve(current.value as T);
  }

  if (options.force) {
    nextForceRevision += 1;
    forceRevision.set(options.key, nextForceRevision);
  }

  const existing = inFlight.get(options.key) as Promise<T> | undefined;
  if (existing) return existing;

  const generationAtStart = cacheGeneration;
  let observedForceRevision = forceRevision.get(options.key) ?? 0;
  const run = async (): Promise<T> => {
    while (true) {
      let value: T;
      try {
        value = await options.loader();
      } catch (error) {
        const latestForceRevision = forceRevision.get(options.key) ?? 0;
        if (
          generationAtStart === cacheGeneration &&
          latestForceRevision > observedForceRevision
        ) {
          observedForceRevision = latestForceRevision;
          continue;
        }
        throw error;
      }

      if (generationAtStart !== cacheGeneration) return value;
      const latestForceRevision = forceRevision.get(options.key) ?? 0;
      if (latestForceRevision > observedForceRevision) {
        observedForceRevision = latestForceRevision;
        continue;
      }

      const completedAt = Date.now();
      entries.set(options.key, {
        value,
        expiresAt: completedAt + Math.max(0, options.ttlMs),
        lastAccessAt: completedAt,
      });
      pruneRequestCache();
      return value;
    }
  };

  const request = run().finally(() => {
    if (inFlight.get(options.key) === request) inFlight.delete(options.key);
    if (forceRevision.get(options.key) === observedForceRevision) {
      forceRevision.delete(options.key);
    }
  });
  inFlight.set(options.key, request);
  return request;
}

export function clearRequestCache(): void {
  cacheGeneration += 1;
  entries.clear();
  inFlight.clear();
  forceRevision.clear();
}

function pruneRequestCache(): void {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  if (entries.size <= MAX_REQUEST_CACHE_ENTRIES) return;

  const oldest = [...entries.entries()].sort(
    (left, right) => left[1].lastAccessAt - right[1].lastAccessAt,
  );
  for (const [key] of oldest.slice(0, entries.size - MAX_REQUEST_CACHE_ENTRIES)) {
    entries.delete(key);
  }
}
