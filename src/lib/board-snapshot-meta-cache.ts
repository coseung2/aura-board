import "server-only";

export type BoardSnapshotMeta = {
  id: string;
  classroomId: string | null;
  layout: string;
  anonymousAuthor: boolean;
  updatedAt: Date;
  questionPrompt: string | null;
  questionVizMode: string;
};

type SnapshotMetaCacheEntry = {
  boardId: string | null;
  value: BoardSnapshotMeta | null | undefined;
  hasValue: boolean;
  expiresAt: number;
  pending: Promise<BoardSnapshotMeta | null> | null;
  generation: number;
};

const SNAPSHOT_META_TTL_MS = 60_000;
const SNAPSHOT_META_MAX = 2_000;
const entries = new Map<string, SnapshotMetaCacheEntry>();
const keysByBoardId = new Map<string, Set<string>>();
let generation = 0;

function cloneMeta(meta: BoardSnapshotMeta): BoardSnapshotMeta {
  return { ...meta, updatedAt: new Date(meta.updatedAt) };
}

function removeKey(key: string, expected?: SnapshotMetaCacheEntry): void {
  const current = entries.get(key);
  if (!current || (expected && current !== expected)) return;
  entries.delete(key);
  if (current.boardId) {
    const keys = keysByBoardId.get(current.boardId);
    keys?.delete(key);
    if (keys?.size === 0) keysByBoardId.delete(current.boardId);
  }
}

function registerBoardKey(boardId: string, key: string): void {
  const keys = keysByBoardId.get(boardId) ?? new Set<string>();
  keys.add(key);
  keysByBoardId.set(boardId, keys);
}

function touch(key: string, entry: SnapshotMetaCacheEntry): void {
  if (entries.get(key) !== entry) return;
  entries.delete(key);
  entries.set(key, entry);
}

function trim(): void {
  while (entries.size > SNAPSHOT_META_MAX) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    removeKey(oldest);
  }
}

/** Share board authorization/revision metadata across snapshot viewers. */
export async function loadBoardSnapshotMetaCached(
  lookup: string,
  loader: () => Promise<BoardSnapshotMeta | null>,
): Promise<BoardSnapshotMeta | null> {
  const now = Date.now();
  const existing = entries.get(lookup);
  if (existing) {
    if (existing.hasValue && existing.expiresAt > now) {
      existing.expiresAt = now + SNAPSHOT_META_TTL_MS;
      touch(lookup, existing);
      return existing.value ? cloneMeta(existing.value) : null;
    }
    if (existing.pending) {
      const value = await existing.pending;
      return value ? cloneMeta(value) : null;
    }
    removeKey(lookup, existing);
  }

  const requestGeneration = generation;
  const entry: SnapshotMetaCacheEntry = {
    boardId: null,
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
        entries.get(lookup) !== entry
      ) {
        removeKey(lookup, entry);
        return value;
      }
      entry.value = value ? cloneMeta(value) : null;
      entry.hasValue = true;
      entry.expiresAt = Date.now() + SNAPSHOT_META_TTL_MS;
      entry.pending = null;
      entry.boardId = value?.id ?? null;
      if (entry.boardId) registerBoardKey(entry.boardId, lookup);
      touch(lookup, entry);
      trim();
      return value;
    })
    .catch((error) => {
      removeKey(lookup, entry);
      throw error;
    });
  entry.pending = pending;
  entries.set(lookup, entry);
  trim();
  const value = await pending;
  return value ? cloneMeta(value) : null;
}

export function invalidateBoardSnapshotMetaCache(boardId?: string): void {
  generation += 1;
  if (!boardId) {
    entries.clear();
    keysByBoardId.clear();
    return;
  }
  for (const key of [...(keysByBoardId.get(boardId) ?? [])]) {
    removeKey(key);
  }
  keysByBoardId.delete(boardId);
  // Most callers use the board id directly as the lookup.
  removeKey(boardId);
}

export function clearBoardSnapshotMetaCacheForTests(): void {
  invalidateBoardSnapshotMetaCache();
}
