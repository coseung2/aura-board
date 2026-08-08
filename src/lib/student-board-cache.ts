import "server-only";

type StudentBoardCacheEntry<T> = {
  key: string;
  boardId: string | null;
  value: T | undefined;
  hasValue: boolean;
  expiresAt: number;
  pending: Promise<T> | null;
};

const STUDENT_BOARD_CACHE_TTL_MS = 60_000;
const STUDENT_BOARD_CACHE_MAX_ENTRIES = 500;
const entries = new Map<string, StudentBoardCacheEntry<unknown>>();
const keysByBoardId = new Map<string, Set<string>>();
let generation = 0;

function cacheKey(classroomId: string, lookup: string): string {
  return `${classroomId}:${lookup}`;
}

function unregisterBoardKey(boardId: string | null, key: string): void {
  if (!boardId) return;
  const keys = keysByBoardId.get(boardId);
  if (!keys) return;
  keys.delete(key);
  if (keys.size === 0) keysByBoardId.delete(boardId);
}

function removeEntry(
  key: string,
  expected?: StudentBoardCacheEntry<unknown>,
): void {
  const current = entries.get(key);
  if (!current || (expected && current !== expected)) return;
  entries.delete(key);
  unregisterBoardKey(current.boardId, key);
}

function touchEntry(key: string, entry: StudentBoardCacheEntry<unknown>): void {
  if (entries.get(key) !== entry) return;
  entries.delete(key);
  entries.set(key, entry);
}

function trimEntries(): void {
  while (entries.size > STUDENT_BOARD_CACHE_MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    removeEntry(oldestKey);
  }
}

/**
 * Share the immutable board/card/section graph across students opening the same
 * classroom board. Per-student visibility, ownership, and layout data must be
 * layered on after this function returns.
 */
export async function loadStudentBoardBaseCached<
  T extends { id: string } | null,
>(
  classroomId: string,
  lookup: string,
  loader: () => Promise<T>,
): Promise<T> {
  const key = cacheKey(classroomId, lookup);
  const now = Date.now();
  const existing = entries.get(key) as StudentBoardCacheEntry<T> | undefined;
  if (existing) {
    if (existing.hasValue && existing.expiresAt > now) {
      touchEntry(key, existing as StudentBoardCacheEntry<unknown>);
      return existing.value as T;
    }
    if (existing.pending) return existing.pending;
    removeEntry(key, existing as StudentBoardCacheEntry<unknown>);
  }

  const requestGeneration = generation;
  const entry: StudentBoardCacheEntry<T> = {
    key,
    boardId: null,
    value: undefined,
    hasValue: false,
    expiresAt: 0,
    pending: null,
  };
  const pending = loader()
    .then((value) => {
      if (
        generation !== requestGeneration ||
        entries.get(key) !== entry
      ) {
        removeEntry(key, entry as StudentBoardCacheEntry<unknown>);
        return value;
      }

      entry.value = value;
      entry.hasValue = true;
      entry.expiresAt = Date.now() + STUDENT_BOARD_CACHE_TTL_MS;
      entry.pending = null;
      entry.boardId = value?.id ?? null;
      if (entry.boardId) {
        const keys = keysByBoardId.get(entry.boardId) ?? new Set<string>();
        keys.add(key);
        keysByBoardId.set(entry.boardId, keys);
      }
      touchEntry(key, entry as StudentBoardCacheEntry<unknown>);
      trimEntries();
      return value;
    })
    .catch((error) => {
      removeEntry(key, entry as StudentBoardCacheEntry<unknown>);
      throw error;
    });
  entry.pending = pending;
  entries.set(key, entry as StudentBoardCacheEntry<unknown>);
  trimEntries();
  return pending;
}

export function invalidateStudentBoardCache(boardId?: string): void {
  generation += 1;
  if (!boardId) {
    entries.clear();
    keysByBoardId.clear();
    return;
  }
  const keys = [...(keysByBoardId.get(boardId) ?? [])];
  for (const key of keys) removeEntry(key);
  keysByBoardId.delete(boardId);
}

export function clearStudentBoardCacheForTests(): void {
  invalidateStudentBoardCache();
}
