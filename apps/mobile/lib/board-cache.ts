import type { BoardDetailResponse, BoardMeta } from "./types";

/**
 * 학생 보드 화면에서만 사용하는 메모리 SWR 저장소.
 *
 * 카드/보드 데이터는 SecureStore/localStorage에 기록하지 않는다. 이 모듈은
 * 세션 토큰을 알지 못하며, `session.ts`가 로그인 교체/로그아웃 때
 * `clearBoardCache()`를 호출해 인증 경계를 보장한다.
 */

export const BOARD_LIST_CACHE_KEY = "student:boards" as const;
export const STUDENT_HOME_CACHE_KEY = "student:me" as const;
export const BOARD_DETAIL_CACHE_PREFIX = "student:board:" as const;

export type BoardCacheKind = "boards" | "detail";
export type BoardCacheState = "fresh" | "stale";

export type BoardCacheSnapshot<T> = {
  /** Current cached value. `value` is retained as a convenient alias. */
  data: T;
  value: T;
  key: string;
  kind: BoardCacheKind;
  state: BoardCacheState;
  isFresh: boolean;
  isStale: boolean;
  dirty: boolean;
  ageMs: number;
  fetchedAt: number;
  lastAccessAt: number;
};

export type BoardCacheReadOptions = {
  now?: number;
  kind?: BoardCacheKind;
};

export type BoardCacheWriteOptions = BoardCacheReadOptions;

export type BoardCacheRevalidateOptions = BoardCacheReadOptions & {
  /** Always call the loader, even when the value is within its fresh TTL. */
  force?: boolean;
};

type InternalEntry<T = unknown> = {
  key: string;
  data: T;
  kind: BoardCacheKind;
  fetchedAt: number;
  lastAccessAt: number;
  dirty: boolean;
};

const FRESH_TTL_MS: Record<BoardCacheKind, number> = {
  boards: 30_000,
  detail: 15_000,
};

const STALE_MAX_MS: Record<BoardCacheKind, number> = {
  boards: 5 * 60_000,
  detail: 2 * 60_000,
};

// A student normally has only a handful of boards open. Keep the cap finite so
// repeatedly visiting arbitrary slugs cannot grow the process indefinitely.
export const BOARD_CACHE_MAX_ENTRIES = 32;

const entries = new Map<string, InternalEntry>();
const inFlight = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

export function boardDetailCacheKey(slug: string): string {
  return `${BOARD_DETAIL_CACHE_PREFIX}${encodeURIComponent(slug)}`;
}

export const getBoardDetailCacheKey = boardDetailCacheKey;

export function boardListCacheKey(): typeof BOARD_LIST_CACHE_KEY {
  return BOARD_LIST_CACHE_KEY;
}

export function getBoardCacheKind(
  key: string,
  kind?: BoardCacheKind,
): BoardCacheKind {
  if (kind) return kind;
  return key === BOARD_LIST_CACHE_KEY ? "boards" : "detail";
}

function ttlFor(kind: BoardCacheKind): { fresh: number; staleMax: number } {
  return { fresh: FRESH_TTL_MS[kind], staleMax: STALE_MAX_MS[kind] };
}

function snapshotFor<T>(
  entry: InternalEntry<T>,
  now: number,
): BoardCacheSnapshot<T> | null {
  const ageMs = Math.max(0, now - entry.fetchedAt);
  const { fresh, staleMax } = ttlFor(entry.kind);

  // A value that is too old must not be shown as a usable stale response. It is
  // removed eagerly; a concurrent revalidation can still repopulate it when it
  // completes in the current cache generation.
  if (ageMs > staleMax) {
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    return null;
  }

  const isFresh = !entry.dirty && ageMs < fresh;
  const state: BoardCacheState = isFresh ? "fresh" : "stale";
  return {
    data: entry.data,
    value: entry.data,
    key: entry.key,
    kind: entry.kind,
    state,
    isFresh,
    isStale: !isFresh,
    dirty: entry.dirty,
    ageMs,
    fetchedAt: entry.fetchedAt,
    lastAccessAt: entry.lastAccessAt,
  };
}

/** Return fresh or usable-stale data, or null when absent/too old. */
export function readBoardCache<T = unknown>(
  key: string,
  options: BoardCacheReadOptions = {},
): BoardCacheSnapshot<T> | null {
  const entry = entries.get(key) as InternalEntry<T> | undefined;
  if (!entry) return null;

  const now = options.now ?? Date.now();
  // A caller may provide the kind when using a custom key. The first writer's
  // kind remains authoritative for existing entries, preventing TTL drift.
  if (options.kind && entry.kind !== options.kind) return null;
  entry.lastAccessAt = now;
  return snapshotFor(entry, now);
}

/** Store a successful response and prune the oldest entries. */
export function writeBoardCache<T>(
  key: string,
  data: T,
  options: BoardCacheWriteOptions = {},
): BoardCacheSnapshot<T> {
  const now = options.now ?? Date.now();
  const kind = getBoardCacheKind(key, options.kind);
  const entry: InternalEntry<T> = {
    key,
    data,
    kind,
    fetchedAt: now,
    lastAccessAt: now,
    dirty: false,
  };
  entries.set(key, entry);
  pruneBoardCache(now);
  return snapshotFor(entry, now) as BoardCacheSnapshot<T>;
}

export const setBoardCache = writeBoardCache;
export const getBoardCache = readBoardCache;

/**
 * Mark one key (or every key) dirty. Dirty data remains usable as stale data
 * until its stale-max age, but callers should schedule one revalidation.
 */
export function invalidateBoardCache(key?: string): void {
  if (key) {
    const entry = entries.get(key);
    if (entry) entry.dirty = true;
    return;
  }
  for (const entry of entries.values()) entry.dirty = true;
}

export const markBoardCacheDirty = invalidateBoardCache;

/**
 * Remove one cached board response when the server says it no longer exists
 * or is no longer visible to the current student. Unlike invalidation, this
 * prevents a forbidden detail snapshot from being rendered again on the next
 * focus before revalidation completes.
 */
export function removeBoardCache(key: string): void {
  entries.delete(key);
}

/** Remove expired/least-recently-used entries while respecting the cap. */
export function pruneBoardCache(now = Date.now()): void {
  for (const [key, entry] of entries) {
    if (now - entry.fetchedAt > STALE_MAX_MS[entry.kind]) entries.delete(key);
  }
  if (entries.size <= BOARD_CACHE_MAX_ENTRIES) return;

  const oldest = [...entries.values()].sort(
    (left, right) => left.lastAccessAt - right.lastAccessAt,
  );
  for (const entry of oldest.slice(0, entries.size - BOARD_CACHE_MAX_ENTRIES)) {
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
  }
}

/**
 * Clear all board data and in-flight requests at an authentication boundary.
 * The generation guard prevents an old request from repopulating the cache
 * after logout/login while its promise is still settling.
 */
export function clearBoardCache(): void {
  cacheGeneration += 1;
  entries.clear();
  inFlight.clear();
}

export const resetBoardCache = clearBoardCache;
export const clearAllBoardCache = clearBoardCache;

export function boardCacheSize(): number {
  return entries.size;
}

export function boardCacheHasInFlight(key: string): boolean {
  return inFlight.has(key);
}

/**
 * Revalidate a key with per-key in-flight deduplication. Fresh values are
 * returned without a network call unless `force` is set. Stale values are not
 * returned here; screens can render them synchronously with `readBoardCache`
 * and use this promise as a background revalidation.
 */
export function revalidateBoardCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: BoardCacheRevalidateOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now();
  const current = readBoardCache<T>(key, { now, kind: options.kind });
  if (!options.force && current?.isFresh) return Promise.resolve(current.data);

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const generationAtStart = cacheGeneration;
  let loaded: Promise<T>;
  try {
    // Start the loader synchronously so a second caller in the same tick can
    // observe the in-flight registry and share this exact promise.
    loaded = Promise.resolve(loader());
  } catch (error) {
    loaded = Promise.reject(error);
  }
  const request = loaded
    .then((data) => {
      // Do not let a request belonging to a previous student session write
      // into this session's cache.
      if (generationAtStart === cacheGeneration) {
        writeBoardCache(key, data, { now: Date.now(), kind: options.kind });
      }
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

/** Convenience aliases for callers that prefer get/fetch naming. */
export const fetchBoardCache = revalidateBoardCache;
export const getOrFetchBoardCache = revalidateBoardCache;

// Keep these response aliases close to the cache key API so screen call sites
// can remain typed without introducing another abstraction.
export type StudentBoardList = BoardMeta[];
export type StudentBoardDetail = BoardDetailResponse;
