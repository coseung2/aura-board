import "server-only";

export type BoardAccessBase = {
  id: string;
  classroomId: string | null;
  anonymousAuthor: boolean;
  layout: string;
  teacherId: string | null;
};

type BoardAccessCacheEntry = {
  value: BoardAccessBase | null | undefined;
  hasValue: boolean;
  expiresAt: number;
  pending: Promise<BoardAccessBase | null> | null;
  generation: number;
};

const BOARD_ACCESS_CACHE_TTL_MS = 60_000;
const BOARD_ACCESS_CACHE_MAX = 2_000;
const entries = new Map<string, BoardAccessCacheEntry>();
let generation = 0;

function remove(boardId: string, expected?: BoardAccessCacheEntry): void {
  const current = entries.get(boardId);
  if (!current || (expected && current !== expected)) return;
  entries.delete(boardId);
}

function touch(boardId: string, entry: BoardAccessCacheEntry): void {
  if (entries.get(boardId) !== entry) return;
  entries.delete(boardId);
  entries.set(boardId, entry);
}

function trim(): void {
  while (entries.size > BOARD_ACCESS_CACHE_MAX) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

export function primeBoardAccessCache(value: BoardAccessBase): void {
  entries.set(value.id, {
    value: { ...value },
    hasValue: true,
    expiresAt: Date.now() + BOARD_ACCESS_CACHE_TTL_MS,
    pending: null,
    generation,
  });
  touch(value.id, entries.get(value.id)!);
  trim();
}

/** Share classroom ownership metadata already loaded by board-open requests. */
export async function loadBoardAccessBaseCached(
  boardId: string,
  loader: () => Promise<BoardAccessBase | null>,
): Promise<BoardAccessBase | null> {
  const now = Date.now();
  const existing = entries.get(boardId);
  if (existing) {
    if (existing.hasValue && existing.expiresAt > now) {
      touch(boardId, existing);
      return existing.value ? { ...existing.value } : null;
    }
    if (existing.pending) return existing.pending;
    remove(boardId, existing);
  }

  const requestGeneration = generation;
  const entry: BoardAccessCacheEntry = {
    value: undefined,
    hasValue: false,
    expiresAt: 0,
    pending: null,
    generation: requestGeneration,
  };
  const pending = loader()
    .then((value) => {
      if (
        generation !== requestGeneration ||
        entries.get(boardId) !== entry
      ) {
        remove(boardId, entry);
        return value;
      }
      entry.value = value ? { ...value } : null;
      entry.hasValue = true;
      entry.expiresAt = Date.now() + BOARD_ACCESS_CACHE_TTL_MS;
      entry.pending = null;
      touch(boardId, entry);
      trim();
      return value ? { ...value } : null;
    })
    .catch((error) => {
      remove(boardId, entry);
      throw error;
    });
  entry.pending = pending;
  entries.set(boardId, entry);
  trim();
  return pending;
}

export function invalidateBoardAccessCache(boardId?: string): void {
  generation += 1;
  if (boardId) entries.delete(boardId);
  else entries.clear();
}

export function clearBoardAccessCacheForTests(): void {
  invalidateBoardAccessCache();
}
