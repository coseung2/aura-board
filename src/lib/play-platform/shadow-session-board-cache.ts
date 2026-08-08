const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 2_000;

type CacheEntry = {
  boardId: string;
  expiresAt: number;
};

const sessionBoards = new Map<string, CacheEntry>();

function trimExpired(now: number) {
  for (const [sessionId, entry] of sessionBoards) {
    if (entry.expiresAt <= now) sessionBoards.delete(sessionId);
  }
}

export function rememberShadowSessionBoard(
  sessionId: string,
  boardId: string,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
) {
  if (!sessionId || !boardId) return;
  if (sessionBoards.size >= MAX_ENTRIES && !sessionBoards.has(sessionId)) {
    trimExpired(now);
    if (sessionBoards.size >= MAX_ENTRIES) {
      const oldest = sessionBoards.keys().next().value;
      if (oldest) sessionBoards.delete(oldest);
    }
  }
  sessionBoards.delete(sessionId);
  sessionBoards.set(sessionId, {
    boardId,
    expiresAt: now + Math.max(1, ttlMs),
  });
}

export function hasShadowSessionBoard(
  sessionId: string,
  boardId: string,
  now = Date.now(),
): boolean {
  const entry = sessionBoards.get(sessionId);
  if (!entry) return false;
  if (entry.expiresAt <= now) {
    sessionBoards.delete(sessionId);
    return false;
  }
  return entry.boardId === boardId;
}

export function resetShadowSessionBoardCache() {
  sessionBoards.clear();
}
