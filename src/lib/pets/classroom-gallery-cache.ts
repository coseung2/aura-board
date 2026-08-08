const DEFAULT_TTL_MS = 2_000;
const MAX_ENTRIES = 500;

type CacheEntry = {
  expiresAt: number;
  promise: Promise<unknown>;
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

/**
 * Classroom pet galleries are identical for every student in the classroom.
 * Coalesce bursty screen opens into one query while keeping the staleness
 * window short enough that equipment and representative changes appear on the
 * next normal refresh.
 */
export function cachedClassroomSlimeRows<T>(
  classroomId: string,
  loader: () => Promise<T>,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const cached = entries.get(classroomId);
  if (cached && cached.expiresAt > now) {
    return cached.promise as Promise<T>;
  }

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

export function invalidateClassroomSlimeRows(classroomId: string) {
  entries.delete(classroomId);
}

export function resetClassroomSlimeRowsCache() {
  entries.clear();
}
