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

export const PARENT_MERGED_CURSOR_VERSION = 2;

export type ParentPublicationCursor = {
  publishedAt: Date;
  publicationId: string;
};

export type ParentMergedFeedCursor = {
  card: ParentFeedCursor | null;
  publication: ParentPublicationCursor | null;
};

type MergedCursorPayload = {
  v: typeof PARENT_MERGED_CURSOR_VERSION;
  card: { c: string; i: string } | null;
  publication: { t: string; pid: string } | null;
};

export function encodeParentMergedFeedCursor(
  cursor: ParentMergedFeedCursor,
): string {
  const payload: MergedCursorPayload = {
    v: PARENT_MERGED_CURSOR_VERSION,
    card: cursor.card
      ? { c: cursor.card.createdAt.toISOString(), i: cursor.card.id }
      : null,
    publication: cursor.publication
      ? {
          t: cursor.publication.publishedAt.toISOString(),
          pid: cursor.publication.publicationId,
        }
      : null,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeParentMergedFeedCursor(
  value: string,
): ParentMergedFeedCursor | null {
  if (
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<MergedCursorPayload>;
    if (
      payload.v !== PARENT_MERGED_CURSOR_VERSION ||
      (payload.card !== null &&
        (typeof payload.card !== "object" ||
          payload.card === null ||
          typeof payload.card.c !== "string" ||
          typeof payload.card.i !== "string")) ||
      (payload.publication !== null &&
        (typeof payload.publication !== "object" ||
          payload.publication === null ||
          typeof payload.publication.t !== "string" ||
          typeof payload.publication.pid !== "string"))
    ) {
      return null;
    }

    const card = payload.card
      ? (() => {
          const createdAt = new Date(payload.card.c);
          if (
            Number.isNaN(createdAt.getTime()) ||
            createdAt.toISOString() !== payload.card.c ||
            payload.card.i.length === 0 ||
            payload.card.i.length > MAX_ID_LENGTH
          ) {
            return null;
          }
          return { createdAt, id: payload.card.i };
        })()
      : null;
    if (payload.card && !card) return null;

    const publication = payload.publication
      ? (() => {
          const publishedAt = new Date(payload.publication.t);
          if (
            Number.isNaN(publishedAt.getTime()) ||
            publishedAt.toISOString() !== payload.publication.t ||
            payload.publication.pid.length === 0 ||
            payload.publication.pid.length > MAX_ID_LENGTH
          ) {
            return null;
          }
          return { publishedAt, publicationId: payload.publication.pid };
        })()
      : null;
    if (payload.publication && !publication) return null;

    return { card, publication };
  } catch {
    return null;
  }
}
