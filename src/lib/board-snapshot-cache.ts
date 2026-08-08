import "server-only";

import { invalidateStudentBoardCache } from "./student-board-cache";
import { invalidateBoardSnapshotMetaCache } from "./board-snapshot-meta-cache";

type SnapshotCacheEntry<T> = {
  revision: string;
  value: T | null;
  expiresAt: number;
  pending: Promise<T> | null;
  generation: number;
};

const SNAPSHOT_CACHE_TTL_MS = 5_000;
const SNAPSHOT_CACHE_MAX_BOARDS = 500;
const entries = new Map<string, SnapshotCacheEntry<unknown>>();
let generation = 0;

function touchEntry(boardId: string, entry: SnapshotCacheEntry<unknown>): void {
  entries.delete(boardId);
  entries.set(boardId, entry);
}

function trimEntries(): void {
  while (entries.size > SNAPSHOT_CACHE_MAX_BOARDS) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

/**
 * Coalesces simultaneous authoritative snapshot reads for one board and keeps
 * the immutable common payload briefly. Per-viewer fields must be layered on
 * after this function returns.
 */
export async function loadBoardSnapshotCached<T>(
  boardId: string,
  revision: string,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(boardId) as SnapshotCacheEntry<T> | undefined;
  if (existing?.revision === revision) {
    if (existing.value !== null && existing.expiresAt > now) {
      touchEntry(boardId, existing as SnapshotCacheEntry<unknown>);
      return existing.value;
    }
    if (existing.pending) return existing.pending;
  }

  const requestGeneration = generation;
  const entry: SnapshotCacheEntry<T> = {
    revision,
    value: null,
    expiresAt: 0,
    pending: null,
    generation: requestGeneration,
  };
  const pending = loader()
    .then((value) => {
      if (
        generation === requestGeneration &&
        entries.get(boardId) === entry
      ) {
        entry.value = value;
        entry.expiresAt = Date.now() + SNAPSHOT_CACHE_TTL_MS;
        entry.pending = null;
        touchEntry(boardId, entry as SnapshotCacheEntry<unknown>);
        trimEntries();
      }
      return value;
    })
    .catch((error) => {
      if (entries.get(boardId) === entry) entries.delete(boardId);
      throw error;
    });
  entry.pending = pending;
  entries.set(boardId, entry as SnapshotCacheEntry<unknown>);
  trimEntries();
  return pending;
}

export function invalidateBoardSnapshotCache(boardId?: string): void {
  generation += 1;
  if (boardId) entries.delete(boardId);
  else entries.clear();
  invalidateStudentBoardCache(boardId);
  invalidateBoardSnapshotMetaCache(boardId);
}

export function clearBoardSnapshotCacheForTests(): void {
  invalidateBoardSnapshotCache();
}
