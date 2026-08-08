import "server-only";

export type BoardViewerLikeIdentity =
  | { kind: "teacher"; id: string }
  | { kind: "student"; id: string };

type ViewerLikeCacheEntry = {
  cardIds: Set<string> | null;
  expiresAt: number;
  pending: Promise<Set<string>> | null;
  generation: number;
};

const VIEWER_LIKE_CACHE_TTL_MS = 60_000;
const VIEWER_LIKE_CACHE_MAX = 10_000;
const entries = new Map<string, ViewerLikeCacheEntry>();
let generation = 0;

function keyFor(
  boardId: string,
  viewer: BoardViewerLikeIdentity,
): string {
  return `${viewer.kind}:${viewer.id}:${boardId}`;
}

function cloneCardIds(cardIds: Set<string>): Set<string> {
  return new Set(cardIds);
}

function touch(key: string, entry: ViewerLikeCacheEntry): void {
  if (entries.get(key) !== entry) return;
  entries.delete(key);
  entries.set(key, entry);
}

function trim(): void {
  while (entries.size > VIEWER_LIKE_CACHE_MAX) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

/** Cache one viewer's liked card IDs for a board between snapshot refreshes. */
export async function loadBoardViewerLikedCardsCached(
  boardId: string,
  viewer: BoardViewerLikeIdentity,
  loader: () => Promise<readonly string[]>,
): Promise<Set<string>> {
  const key = keyFor(boardId, viewer);
  const now = Date.now();
  const existing = entries.get(key);
  if (existing) {
    if (existing.cardIds && existing.expiresAt > now) {
      existing.expiresAt = now + VIEWER_LIKE_CACHE_TTL_MS;
      touch(key, existing);
      return cloneCardIds(existing.cardIds);
    }
    if (existing.pending) return cloneCardIds(await existing.pending);
    entries.delete(key);
  }

  const requestGeneration = generation;
  const entry: ViewerLikeCacheEntry = {
    cardIds: null,
    expiresAt: 0,
    pending: null,
    generation: requestGeneration,
  };
  const pending = loader()
    .then((rows) => {
      const cardIds = new Set(rows);
      if (
        generation === requestGeneration &&
        entries.get(key) === entry
      ) {
        entry.cardIds = cardIds;
        entry.expiresAt = Date.now() + VIEWER_LIKE_CACHE_TTL_MS;
        entry.pending = null;
        touch(key, entry);
        trim();
      }
      return cardIds;
    })
    .catch((error) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
  entry.pending = pending;
  entries.set(key, entry);
  trim();
  return cloneCardIds(await pending);
}

/** Keep the cache coherent with an idempotent like/unlike mutation. */
export function updateBoardViewerLikeCache(
  boardId: string,
  viewer: BoardViewerLikeIdentity,
  cardId: string,
  liked: boolean,
): void {
  const key = keyFor(boardId, viewer);
  const now = Date.now();
  const existing = entries.get(key);
  const cardIds =
    existing?.cardIds && existing.expiresAt > now
      ? cloneCardIds(existing.cardIds)
      : new Set<string>();
  if (liked) cardIds.add(cardId);
  else cardIds.delete(cardId);
  const entry: ViewerLikeCacheEntry = {
    cardIds,
    expiresAt: now + VIEWER_LIKE_CACHE_TTL_MS,
    pending: null,
    generation,
  };
  entries.set(key, entry);
  touch(key, entry);
  trim();
}

export function invalidateBoardViewerLikeCache(boardId?: string): void {
  generation += 1;
  if (!boardId) {
    entries.clear();
    return;
  }
  const suffix = `:${boardId}`;
  for (const key of entries.keys()) {
    if (key.endsWith(suffix)) entries.delete(key);
  }
}

export function clearBoardViewerLikeCacheForTests(): void {
  invalidateBoardViewerLikeCache();
}
