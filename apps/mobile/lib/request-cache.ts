type RequestCacheEntry = {
  value: unknown;
  expiresAt: number;
  lastAccessAt: number;
};

const MAX_REQUEST_CACHE_ENTRIES = 32;
const entries = new Map<string, RequestCacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
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

  const existing = inFlight.get(options.key) as Promise<T> | undefined;
  if (existing) return existing;

  let loaded: Promise<T>;
  const generationAtStart = cacheGeneration;
  try {
    loaded = Promise.resolve(options.loader());
  } catch (error) {
    loaded = Promise.reject(error);
  }

  const request = loaded
    .then((value) => {
      const completedAt = Date.now();
      if (generationAtStart === cacheGeneration) {
        entries.set(options.key, {
          value,
          expiresAt: completedAt + Math.max(0, options.ttlMs),
          lastAccessAt: completedAt,
        });
        pruneRequestCache();
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(options.key) === request) inFlight.delete(options.key);
    });
  inFlight.set(options.key, request);
  return request;
}

export function clearRequestCache(): void {
  cacheGeneration += 1;
  entries.clear();
  inFlight.clear();
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
