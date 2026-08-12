export type ParentDataCacheKind =
  | "overview"
  | "feed"
  | "reading"
  | "walking";

export type ParentDataCacheSnapshot<T> = {
  key: string;
  kind: ParentDataCacheKind;
  data: T;
  fetchedAt: number;
  ageMs: number;
  dirty: boolean;
  isFresh: boolean;
  isStale: boolean;
};

type ParentDataCacheEntry<T = unknown> = {
  key: string;
  kind: ParentDataCacheKind;
  data: T;
  fetchedAt: number;
  lastAccessAt: number;
  dirty: boolean;
};

type CacheReadOptions = {
  kind?: ParentDataCacheKind;
  now?: number;
};

type CacheWriteOptions = CacheReadOptions;

type CacheRevalidateOptions = CacheReadOptions & {
  force?: boolean;
};

const FRESH_TTL_MS: Record<ParentDataCacheKind, number> = {
  overview: 30_000,
  feed: 20_000,
  reading: 60_000,
  walking: 30_000,
};

const STALE_MAX_MS: Record<ParentDataCacheKind, number> = {
  overview: 10 * 60_000,
  feed: 10 * 60_000,
  reading: 30 * 60_000,
  walking: 10 * 60_000,
};

const MAX_ENTRIES = 48;

export const PARENT_OVERVIEW_CACHE_KEY = "parent:overview" as const;
export const PARENT_READING_CACHE_KEY = "parent:reading" as const;
export const PARENT_WALKING_CACHE_KEY = "parent:walking" as const;
export const PARENT_WALKING_DEVICE_CACHE_KEY =
  "parent:walking:device" as const;
export const PARENT_WALKING_HEALTH_CACHE_KEY =
  "parent:walking:health" as const;
export const PARENT_POST_COLLECTION_CACHE_PREFIX = "parent:posts:" as const;

const entries = new Map<string, ParentDataCacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const revisions = new Map<string, number>();
let cacheGeneration = 0;

export function parentPostCollectionCacheKey(endpoint: string): string {
  return `${PARENT_POST_COLLECTION_CACHE_PREFIX}${encodeURIComponent(endpoint)}`;
}

function inferKind(key: string, provided?: ParentDataCacheKind): ParentDataCacheKind {
  if (provided) return provided;
  if (key === PARENT_OVERVIEW_CACHE_KEY) return "overview";
  if (key === PARENT_READING_CACHE_KEY) return "reading";
  if (
    key === PARENT_WALKING_CACHE_KEY ||
    key === PARENT_WALKING_DEVICE_CACHE_KEY ||
    key === PARENT_WALKING_HEALTH_CACHE_KEY
  ) {
    return "walking";
  }
  return "feed";
}

function revisionFor(key: string): number {
  return revisions.get(key) ?? 0;
}

function bumpRevision(key: string): void {
  revisions.set(key, revisionFor(key) + 1);
  inFlight.delete(key);
}

function snapshotFor<T>(
  entry: ParentDataCacheEntry<T>,
  now: number,
): ParentDataCacheSnapshot<T> | null {
  const ageMs = Math.max(0, now - entry.fetchedAt);
  if (ageMs > STALE_MAX_MS[entry.kind]) {
    if (entries.get(entry.key) === entry) {
      entries.delete(entry.key);
      bumpRevision(entry.key);
    }
    return null;
  }

  const isFresh = !entry.dirty && ageMs < FRESH_TTL_MS[entry.kind];
  return {
    key: entry.key,
    kind: entry.kind,
    data: entry.data,
    fetchedAt: entry.fetchedAt,
    ageMs,
    dirty: entry.dirty,
    isFresh,
    isStale: !isFresh,
  };
}

export function readParentDataCache<T>(
  key: string,
  options: CacheReadOptions = {},
): ParentDataCacheSnapshot<T> | null {
  const entry = entries.get(key) as ParentDataCacheEntry<T> | undefined;
  if (!entry) return null;
  if (options.kind && entry.kind !== options.kind) return null;

  const now = options.now ?? Date.now();
  entry.lastAccessAt = now;
  return snapshotFor(entry, now);
}

function setParentDataCache<T>(
  key: string,
  data: T,
  options: CacheWriteOptions,
  bump = true,
): ParentDataCacheSnapshot<T> {
  const now = options.now ?? Date.now();
  const entry: ParentDataCacheEntry<T> = {
    key,
    kind: inferKind(key, options.kind),
    data,
    fetchedAt: now,
    lastAccessAt: now,
    dirty: false,
  };
  if (bump) bumpRevision(key);
  entries.set(key, entry);
  pruneParentDataCache(now);
  return snapshotFor(entry, now) as ParentDataCacheSnapshot<T>;
}

export function writeParentDataCache<T>(
  key: string,
  data: T,
  options: CacheWriteOptions = {},
): ParentDataCacheSnapshot<T> {
  return setParentDataCache(key, data, options, true);
}

export function updateParentDataCache<T>(
  key: string,
  updater: (current: T) => T,
  options: CacheWriteOptions = {},
): ParentDataCacheSnapshot<T> | null {
  const current = readParentDataCache<T>(key, options);
  if (!current) return null;
  return writeParentDataCache(key, updater(current.data), {
    ...options,
    kind: current.kind,
  });
}

export function invalidateParentDataCache(key?: string): void {
  if (key) {
    const entry = entries.get(key);
    if (entry) entry.dirty = true;
    bumpRevision(key);
    return;
  }

  for (const [entryKey, entry] of entries) {
    entry.dirty = true;
    bumpRevision(entryKey);
  }
}

export function removeParentDataCache(key: string): void {
  entries.delete(key);
  bumpRevision(key);
}

export function removeParentDataCacheByPrefix(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) removeParentDataCache(key);
  }
}

export function clearParentDataCache(): void {
  cacheGeneration += 1;
  entries.clear();
  inFlight.clear();
  revisions.clear();
}

export function pruneParentDataCache(now = Date.now()): void {
  for (const [key, entry] of entries) {
    if (now - entry.fetchedAt > STALE_MAX_MS[entry.kind]) {
      entries.delete(key);
      bumpRevision(key);
    }
  }
  if (entries.size <= MAX_ENTRIES) return;

  const oldest = [...entries.values()].sort(
    (left, right) => left.lastAccessAt - right.lastAccessAt,
  );
  for (const entry of oldest.slice(0, entries.size - MAX_ENTRIES)) {
    if (entries.get(entry.key) === entry) {
      entries.delete(entry.key);
      bumpRevision(entry.key);
    }
  }
}

export function revalidateParentDataCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: CacheRevalidateOptions = {},
): Promise<T> {
  const current = readParentDataCache<T>(key, options);
  if (!options.force && current?.isFresh) {
    return Promise.resolve(current.data);
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const generationAtStart = cacheGeneration;
  const revisionAtStart = revisionFor(key);
  let loaded: Promise<T>;
  try {
    loaded = Promise.resolve(loader());
  } catch (error) {
    loaded = Promise.reject(error);
  }

  const request = loaded
    .then((data) => {
      if (
        generationAtStart === cacheGeneration &&
        revisionAtStart === revisionFor(key)
      ) {
        setParentDataCache(key, data, options, false);
      }
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export function parentDataCacheSize(): number {
  return entries.size;
}

export function parentDataCacheHasInFlight(key: string): boolean {
  return inFlight.has(key);
}
