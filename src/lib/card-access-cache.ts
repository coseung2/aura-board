import "server-only";

export type CachedCardAccessBase = {
  id: string;
  studentAuthorId: string | null;
  studentAuthorIds: string[];
  board: {
    id: string;
    classroomId: string | null;
    anonymousAuthor: boolean;
  };
};

type CardAccessCacheEntry = {
  value: CachedCardAccessBase | null | undefined;
  hasValue: boolean;
  expiresAt: number;
  pending: Promise<CachedCardAccessBase | null> | null;
};

const CARD_ACCESS_CACHE_TTL_MS = 5_000;
const CARD_ACCESS_CACHE_MAX = 5_000;
const entries = new Map<string, CardAccessCacheEntry>();

function remove(cardId: string, expected?: CardAccessCacheEntry): void {
  const current = entries.get(cardId);
  if (!current || (expected && current !== expected)) return;
  entries.delete(cardId);
}

function touch(cardId: string, entry: CardAccessCacheEntry): void {
  if (entries.get(cardId) !== entry) return;
  entries.delete(cardId);
  entries.set(cardId, entry);
}

function trim(): void {
  while (entries.size > CARD_ACCESS_CACHE_MAX) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

/** Share immutable card-to-board authorization metadata across a class wave. */
export async function loadCardAccessBaseCached(
  cardId: string,
  loader: () => Promise<CachedCardAccessBase | null>,
): Promise<CachedCardAccessBase | null> {
  const now = Date.now();
  const existing = entries.get(cardId);
  if (existing) {
    if (existing.hasValue && existing.expiresAt > now) {
      touch(cardId, existing);
      return existing.value ?? null;
    }
    if (existing.pending) return existing.pending;
    remove(cardId, existing);
  }

  const entry: CardAccessCacheEntry = {
    value: undefined,
    hasValue: false,
    expiresAt: 0,
    pending: null,
  };
  const pending = loader()
    .then((value) => {
      if (entries.get(cardId) !== entry) {
        remove(cardId, entry);
        return value;
      }
      entry.value = value;
      entry.hasValue = true;
      entry.expiresAt = Date.now() + CARD_ACCESS_CACHE_TTL_MS;
      entry.pending = null;
      touch(cardId, entry);
      trim();
      return value;
    })
    .catch((error) => {
      remove(cardId, entry);
      throw error;
    });
  entry.pending = pending;
  entries.set(cardId, entry);
  trim();
  return pending;
}

export function invalidateCardAccessCache(cardId?: string): void {
  if (cardId) entries.delete(cardId);
  else entries.clear();
}

export function clearCardAccessCacheForTests(): void {
  invalidateCardAccessCache();
}
