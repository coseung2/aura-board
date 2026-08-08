const DEFAULT_TTL_MS = 15_000;
const MAX_ENTRIES = 500;

type CurrencyRow = { unitLabel: string } | null;
type CacheEntry = {
  expiresAt: number;
  promise: Promise<CurrencyRow>;
};

const entries = new Map<string, CacheEntry>();

function trim(now: number) {
  for (const [classroomId, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(classroomId);
  }
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

/** Currency labels are classroom-wide and rarely change, while the pet home is
 * opened by every student at once. Keep a short, bounded single-flight cache so
 * one classroom burst does not issue the same lookup twenty times. */
export function cachedClassroomCurrency(
  classroomId: string,
  loader: () => Promise<CurrencyRow>,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
): Promise<CurrencyRow> {
  const cached = entries.get(classroomId);
  if (cached && cached.expiresAt > now) return cached.promise;

  trim(now);
  const promise = loader().catch((error) => {
    const current = entries.get(classroomId);
    if (current?.promise === promise) entries.delete(classroomId);
    throw error;
  });
  entries.set(classroomId, {
    expiresAt: now + Math.max(1, ttlMs),
    promise,
  });
  return promise;
}

export function invalidateClassroomCurrency(classroomId: string) {
  entries.delete(classroomId);
}

export function resetClassroomCurrencyCache() {
  entries.clear();
}
