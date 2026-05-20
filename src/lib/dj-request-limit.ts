export const DJ_REQUEST_LIMIT_PER_HOUR = 3;
export const DJ_REQUEST_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const DJ_REQUEST_LIMIT_ERROR =
  "1시간에 신청곡은 3곡까지만 신청할 수 있어요.";

type DjRequestLimitWhere = {
  boardId: string;
  queueStatus: { not: null };
  createdAt: { gte: Date };
  studentAuthorId: string | null;
  authorId?: string;
};

export function getDjRequestWindowStart(now: Date = new Date()) {
  return new Date(now.getTime() - DJ_REQUEST_LIMIT_WINDOW_MS);
}

export function getDjRequestLimitLockKey({
  boardId,
  userId,
  studentId,
}: {
  boardId: string;
  userId?: string | null;
  studentId?: string | null;
}) {
  if (studentId) {
    return `dj-request-limit:${boardId}:student:${studentId}`;
  }

  if (!userId) {
    throw new Error("DJ request limit requires either userId or studentId");
  }

  return `dj-request-limit:${boardId}:user:${userId}`;
}

export function buildDjRequestLimitWhere({
  boardId,
  userId,
  studentId,
  windowStart,
}: {
  boardId: string;
  userId?: string | null;
  studentId?: string | null;
  windowStart: Date;
}): DjRequestLimitWhere {
  const base = {
    boardId,
    queueStatus: { not: null },
    createdAt: { gte: windowStart },
  };

  if (studentId) {
    return {
      ...base,
      studentAuthorId: studentId,
    };
  }

  if (!userId) {
    throw new Error("DJ request limit requires either userId or studentId");
  }

  return {
    ...base,
    studentAuthorId: null,
    authorId: userId,
  };
}
