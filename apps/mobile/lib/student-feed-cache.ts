import type { FeedItem, FeedPage } from "./feed";

export const STUDENT_FEED_CACHE_KEY = "student:feed" as const;

const FRESH_WINDOW_MS = 30_000;
const USABLE_STALE_WINDOW_MS = 5 * 60_000;

export type StudentFeedCacheState = "fresh" | "stale";

export type StudentFeedCacheSnapshot = {
  key: typeof STUDENT_FEED_CACHE_KEY;
  data: FeedPage;
  fetchedAt: number;
  ageMs: number;
  state: StudentFeedCacheState;
  isFresh: boolean;
  isStale: boolean;
};

export type StudentFeedCacheReadOptions = {
  now?: number;
};

export type StudentFeedCacheWriteOptions = StudentFeedCacheReadOptions;

export type StudentFeedCacheRevalidateOptions =
  StudentFeedCacheReadOptions & {
    force?: boolean;
  };

type StudentFeedCacheEntry = {
  data: FeedPage;
  fetchedAt: number;
};

let entry: StudentFeedCacheEntry | null = null;
let inFlight: Promise<FeedPage> | null = null;
let cacheGeneration = 0;
let cacheRevision = 0;

function dedupeItems(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.publicationId)) return false;
    seen.add(item.publicationId);
    return true;
  });
}

function normalizePage(page: FeedPage): FeedPage {
  return {
    items: dedupeItems(page.items),
    nextCursor: page.nextCursor,
  };
}

function snapshotFor(
  current: StudentFeedCacheEntry,
  now: number,
): StudentFeedCacheSnapshot | null {
  const ageMs = Math.max(0, now - current.fetchedAt);
  if (ageMs > USABLE_STALE_WINDOW_MS) {
    if (entry === current) entry = null;
    return null;
  }

  const isFresh = ageMs < FRESH_WINDOW_MS;
  return {
    key: STUDENT_FEED_CACHE_KEY,
    data: current.data,
    fetchedAt: current.fetchedAt,
    ageMs,
    state: isFresh ? "fresh" : "stale",
    isFresh,
    isStale: !isFresh,
  };
}

export function readStudentFeedCache(
  options: StudentFeedCacheReadOptions = {},
): StudentFeedCacheSnapshot | null {
  if (!entry) return null;
  return snapshotFor(entry, options.now ?? Date.now());
}

function setStudentFeedCache(page: FeedPage, now: number): StudentFeedCacheSnapshot {
  const nextEntry: StudentFeedCacheEntry = {
    data: normalizePage(page),
    fetchedAt: now,
  };
  entry = nextEntry;
  return snapshotFor(nextEntry, now) as StudentFeedCacheSnapshot;
}

export function writeStudentFeedCache(
  page: FeedPage,
  options: StudentFeedCacheWriteOptions = {},
): StudentFeedCacheSnapshot {
  cacheRevision += 1;
  return setStudentFeedCache(page, options.now ?? Date.now());
}

export function appendStudentFeedCache(
  page: FeedPage,
  options: StudentFeedCacheWriteOptions = {},
): StudentFeedCacheSnapshot {
  const current = readStudentFeedCache(options);
  const merged: FeedPage = current
    ? {
        items: [...current.data.items, ...page.items],
        nextCursor: page.nextCursor,
      }
    : page;
  return writeStudentFeedCache(merged, options);
}

export function clearStudentFeedCache(): void {
  cacheGeneration += 1;
  cacheRevision += 1;
  entry = null;
  inFlight = null;
}

export function revalidateStudentFeedCache(
  loader: () => Promise<FeedPage>,
  options: StudentFeedCacheRevalidateOptions = {},
): Promise<FeedPage> {
  const current = readStudentFeedCache(options);
  if (!options.force && current?.isFresh) {
    return Promise.resolve(current.data);
  }

  if (inFlight) return inFlight;

  const generationAtStart = cacheGeneration;
  const revisionAtStart = cacheRevision;
  let loaded: Promise<FeedPage>;
  try {
    loaded = Promise.resolve(loader());
  } catch (error) {
    loaded = Promise.reject(error);
  }

  const request = loaded
    .then((page) => {
      if (
        generationAtStart === cacheGeneration &&
        revisionAtStart === cacheRevision
      ) {
        setStudentFeedCache(page, options.now ?? Date.now());
      }
      return page;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

export function studentFeedCacheHasInFlight(): boolean {
  return inFlight !== null;
}
