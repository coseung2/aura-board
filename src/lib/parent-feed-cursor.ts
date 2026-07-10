const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 512;
const MAX_ID_LENGTH = 200;

export type ParentFeedCursor = {
  createdAt: Date;
  id: string;
};

type CursorPayload = {
  v: typeof CURSOR_VERSION;
  c: string;
  i: string;
};

export function encodeParentFeedCursor(cursor: ParentFeedCursor): string {
  const payload: CursorPayload = {
    v: CURSOR_VERSION,
    c: cursor.createdAt.toISOString(),
    i: cursor.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeParentFeedCursor(value: string): ParentFeedCursor | null {
  if (
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<CursorPayload>;
    if (
      payload.v !== CURSOR_VERSION ||
      typeof payload.c !== "string" ||
      typeof payload.i !== "string" ||
      payload.i.length === 0 ||
      payload.i.length > MAX_ID_LENGTH
    ) {
      return null;
    }

    const createdAt = new Date(payload.c);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== payload.c
    ) {
      return null;
    }

    return { createdAt, id: payload.i };
  } catch {
    return null;
  }
}
