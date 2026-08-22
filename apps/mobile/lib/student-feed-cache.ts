import type { FeedItem, FeedPage } from "./feed";

export const STUDENT_FEED_CACHE_KEY = "student:feed" as const;

const FRESH_WINDOW_MS = 30_000;
const USABLE_STALE_WINDOW_MS = 5 * 60_000;

export type StudentFeedCacheState = "fresh" | "stale";

export type StudentFeedCacheSnapshot = {
  key: string;
  data: FeedPage;
  fetchedAt: number;
  ageMs: number;
  state: StudentFeedCacheState;
  isFresh: boolean;
  isStale: boolean;
};

export type StudentFeedCacheReadOptions = {
  studentId: string;
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

const entries = new Map<string, StudentFeedCacheEntry>();
const inFlights = new Map<string, Promise<FeedPage>>();
const revisions = new Map<string, number>();
let cacheGeneration = 0;

function cacheKey(studentId: string): string {
  return `${STUDENT_FEED_CACHE_KEY}:${studentId}`;
}

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
  key: string,
  current: StudentFeedCacheEntry,
  now: number,
): StudentFeedCacheSnapshot | null {
  const ageMs = Math.max(0, now - current.fetchedAt);
  if (ageMs > USABLE_STALE_WINDOW_MS) {
    if (entries.get(key) === current) entries.delete(key);
    return null;
  }

  const isFresh = ageMs < FRESH_WINDOW_MS;
  return {
    key,
    data: current.data,
    fetchedAt: current.fetchedAt,
    ageMs,
    state: isFresh ? "fresh" : "stale",
    isFresh,
    isStale: !isFresh,
  };
}

export function readStudentFeedCache(
  options: StudentFeedCacheReadOptions,
): StudentFeedCacheSnapshot | null {
  const key = cacheKey(options.studentId);
  const entry = entries.get(key);
  if (!entry) return null;
  return snapshotFor(key, entry, options.now ?? Date.now());
}

function setStudentFeedCache(
  studentId: string,
  page: FeedPage,
  now: number,
): StudentFeedCacheSnapshot {
  const key = cacheKey(studentId);
  const nextEntry: StudentFeedCacheEntry = {
    data: normalizePage(page),
    fetchedAt: now,
  };
  entries.set(key, nextEntry);
  return snapshotFor(key, nextEntry, now) as StudentFeedCacheSnapshot;
}

export function writeStudentFeedCache(
  page: FeedPage,
  options: StudentFeedCacheWriteOptions,
): StudentFeedCacheSnapshot {
  const key = cacheKey(options.studentId);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  return setStudentFeedCache(options.studentId, page, options.now ?? Date.now());
}

export function appendStudentFeedCache(
  page: FeedPage,
  options: StudentFeedCacheWriteOptions,
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
  entries.clear();
  inFlights.clear();
  revisions.clear();
  cacheGeneration += 1;
}

export function revalidateStudentFeedCache(
  loader: () => Promise<FeedPage>,
  options: StudentFeedCacheRevalidateOptions,
): Promise<FeedPage> {
  const current = readStudentFeedCache(options);
  if (!options.force && current?.isFresh) {
    return Promise.resolve(current.data);
  }

  const key = cacheKey(options.studentId);
  const inFlight = inFlights.get(key);
  if (inFlight) return inFlight;

  const generationAtStart = cacheGeneration;
  const revisionAtStart = revisions.get(key) ?? 0;
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
        revisionAtStart === (revisions.get(key) ?? 0)
      ) {
        setStudentFeedCache(options.studentId, page, options.now ?? Date.now());
      }
      return page;
    })
    .finally(() => {
      if (inFlights.get(key) === request) inFlights.delete(key);
    });
  inFlights.set(key, request);
  return request;
}

export function studentFeedCacheHasInFlight(studentId: string): boolean {
  return inFlights.has(cacheKey(studentId));
}
