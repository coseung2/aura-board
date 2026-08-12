import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  decodeParentFeedCursor,
  decodeParentMergedFeedCursor,
  encodeParentFeedCursor,
  encodeParentMergedFeedCursor,
} from "./parent-feed-cursor";
import type {
  ParentFeedCursor,
  ParentMergedFeedCursor,
} from "./parent-feed-cursor";
import { listPublishedFeedForClassrooms } from "./feed/repository";
import type { FeedItem } from "./feed/types";
import type { ParentChildSummary, ParentPostDTO } from "./parent-post-dto";
import { EXCLUDED_BOARD_LAYOUTS } from "./portfolio-acl-pure";
import { mapPortfolioCard } from "./portfolio-card-mapper";

export const PARENT_POST_DEFAULT_LIMIT = 12;
export const PARENT_POST_MAX_LIMIT = 24;
export const PARENT_PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

export type ParentPostPagination = {
  limit: number;
  cursor: ParentFeedCursor | null;
};

export type ParentPostKind = "media" | "text";

export type ParentPostCounts = {
  media: number;
  text: number;
};

export type ParentFeedPublicationMedia = {
  id: string;
  kind: "IMAGE" | "YOUTUBE";
  url: string;
  youtubeVideoId: string | null;
  altText: string | null;
};

export type ParentFeedPublicationDTO = {
  source: "publication";
  id: string;
  authorKind: "PLATFORM" | "TEACHER" | "STUDENT";
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  scope: "GLOBAL" | "CLASSROOM";
  publishedAt: string;
  media: ParentFeedPublicationMedia[];
};

const PARENT_MEDIA_WHERE = {
  OR: [
    { imageUrl: { not: null } },
    { thumbUrl: { not: null } },
    { videoUrl: { not: null } },
    { linkImage: { not: null } },
    {
      attachments: {
        some: {
          OR: [
            { kind: { in: ["image", "video"] } },
            { previewUrl: { not: null } },
          ],
        },
      },
    },
  ],
} satisfies Prisma.CardWhereInput;

export function parseParentPostPagination(
  searchParams: URLSearchParams,
): ParentPostPagination | { error: "invalid_limit" | "invalid_cursor" } {
  const rawLimit = searchParams.get("limit");
  let limit = PARENT_POST_DEFAULT_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) return { error: "invalid_limit" };
    const parsed = Number(rawLimit);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      return { error: "invalid_limit" };
    }
    limit = Math.min(parsed, PARENT_POST_MAX_LIMIT);
  }

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeParentFeedCursor(rawCursor) : null;
  if (rawCursor !== null && !cursor) return { error: "invalid_cursor" };

  return { limit, cursor };
}

export type ParentFeedPagination = {
  limit: number;
  cursor: ParentMergedFeedCursor | null;
};

/**
 * Pagination for the merged parent feed. Accepts the merged v2 cursor and
 * falls back to the legacy card-only v1 cursor.
 */
export function parseParentFeedPagination(
  searchParams: URLSearchParams,
): ParentFeedPagination | { error: "invalid_limit" | "invalid_cursor" } {
  const rawLimit = searchParams.get("limit");
  let limit = PARENT_POST_DEFAULT_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) return { error: "invalid_limit" };
    const parsed = Number(rawLimit);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      return { error: "invalid_limit" };
    }
    limit = Math.min(parsed, PARENT_POST_MAX_LIMIT);
  }

  const rawCursor = searchParams.get("cursor");
  let cursor: ParentMergedFeedCursor | null = null;
  if (rawCursor !== null) {
    cursor = decodeParentMergedFeedCursor(rawCursor);
    if (!cursor) {
      const legacy = decodeParentFeedCursor(rawCursor);
      if (legacy) cursor = { card: legacy, publication: null };
    }
    if (!cursor) return { error: "invalid_cursor" };
  }

  return { limit, cursor };
}

export function parseParentPostKind(
  searchParams: URLSearchParams,
): ParentPostKind | null | { error: "invalid_kind" } {
  const kind = searchParams.get("kind");
  if (kind === null) return null;
  if (kind === "media" || kind === "text") return kind;
  return { error: "invalid_kind" };
}

export async function loadParentChildSummaries(
  studentIds: string[],
): Promise<ParentChildSummary[]> {
  if (studentIds.length === 0) return [];

  const students = await db.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      name: true,
      number: true,
      classroomId: true,
      classroom: { select: { name: true } },
    },
  });
  const byId = new Map(students.map((student) => [student.id, student]));

  return studentIds.flatMap((studentId) => {
    const student = byId.get(studentId);
    return student
      ? [{
          id: student.id,
          name: student.name,
          number: student.number,
          classroomId: student.classroomId,
          classroomName: student.classroom.name,
        }]
      : [];
  });
}

export async function fetchParentPosts({
  children,
  limit,
  cursor,
  kind = null,
  includeCounts = false,
}: {
  children: ParentChildSummary[];
  limit: number;
  cursor: ParentFeedCursor | null;
  kind?: ParentPostKind | null;
  includeCounts?: boolean;
}): Promise<{
  items: ParentPostDTO[];
  nextCursor: string | null;
  total?: number;
  counts?: ParentPostCounts;
}> {
  const studentIds = children.map((child) => child.id);
  if (studentIds.length === 0) {
    return includeCounts
      ? { items: [], nextCursor: null, total: 0, counts: { media: 0, text: 0 } }
      : { items: [], nextCursor: null };
  }

  const [page, counts] = await Promise.all([
    fetchParentCardPage({ children, limit, cursor, kind }),
    includeCounts
      ? Promise.all([
          db.card.count({
            where: buildParentPostWhere(studentIds, { kind }),
          }),
          db.card.count({
            where: buildParentPostWhere(studentIds, { kind: "media" }),
          }),
          db.card.count({
            where: buildParentPostWhere(studentIds, { kind: "text" }),
          }),
        ])
      : Promise.resolve(null),
  ]);

  const pageItems = page.hasMore ? page.items.slice(0, limit) : page.items;
  const last = pageItems.at(-1);

  const response = {
    items: pageItems,
    nextCursor:
      page.hasMore && last
        ? encodeParentFeedCursor({
            createdAt: new Date(last.createdAt),
            id: last.id,
          })
        : null,
  };

  if (!counts) return response;

  const [total, media, text] = counts;
  return {
    ...response,
    total,
    counts: { media, text },
  };
}

async function fetchParentCardPage({
  children,
  limit,
  cursor,
  kind = null,
}: {
  children: ParentChildSummary[];
  limit: number;
  cursor: ParentFeedCursor | null;
  kind?: ParentPostKind | null;
}): Promise<{ items: ParentPostDTO[]; hasMore: boolean }> {
  const studentIds = children.map((child) => child.id);
  const rows = await db.card.findMany({
    where: buildParentPostWhere(studentIds, { cursor, kind }),
    include: {
      author: { select: { name: true } },
      studentAuthor: { select: { name: true } },
      board: {
        select: {
          id: true,
          slug: true,
          title: true,
          layout: true,
          anonymousAuthor: true,
        },
      },
      section: { select: { id: true, title: true } },
      authors: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          studentId: true,
          displayName: true,
          order: true,
        },
      },
      attachments: { orderBy: { order: "asc" } },
      showcaseEntries: { select: { studentId: true } },
      _count: {
        select: {
          likes: true,
          comments: { where: { audience: "public", deletedAt: null } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = rows.map((card): ParentPostDTO => {
    const authorIds = new Set(
      card.authors.flatMap((author) =>
        author.studentId ? [author.studentId] : [],
      ),
    );
    if (card.studentAuthorId) authorIds.add(card.studentAuthorId);

    return {
      ...mapPortfolioCard(card, null),
      linkedChildren: children.filter((child) => authorIds.has(child.id)),
      contentKind: cardHasMedia(card) ? "media" : "text",
    };
  });
  return { items, hasMore };
}

function toParentPublicationDTO(item: FeedItem): ParentFeedPublicationDTO {
  return {
    source: "publication",
    id: item.publicationId,
    authorKind: item.authorKind,
    authorDisplayName: item.authorDisplayName,
    title: item.title,
    body: item.body,
    scope: item.scope,
    publishedAt: item.publishedAt,
    media: item.media.map((media) => ({
      id: media.id,
      kind: media.kind,
      url: media.url,
      youtubeVideoId: media.youtubeVideoId ?? null,
      altText: media.altText ?? null,
    })),
  };
}

/**
 * Merged parent feed: children's card posts plus every GLOBAL publication and
 * every CLASSROOM publication targeting one of the children's classrooms, in
 * one time-ordered stream with a two-stream keyset cursor.
 */
export async function fetchParentFeedMerged({
  children,
  limit,
  cursor,
  includeCounts = false,
}: {
  children: ParentChildSummary[];
  limit: number;
  cursor: ParentMergedFeedCursor | null;
  includeCounts?: boolean;
}): Promise<{
  items: Array<ParentPostDTO | ParentFeedPublicationDTO>;
  nextCursor: string | null;
  total?: number;
  counts?: ParentPostCounts;
}> {
  const studentIds = children.map((child) => child.id);
  if (studentIds.length === 0) {
    return includeCounts
      ? { items: [], nextCursor: null, total: 0, counts: { media: 0, text: 0 } }
      : { items: [], nextCursor: null };
  }

  const classroomIds = [
    ...new Set(
      children
        .map((child) => child.classroomId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [cardPage, publicationPage, counts] = await Promise.all([
    fetchParentCardPage({
      children,
      limit,
      cursor: cursor?.card ?? null,
    }),
    classroomIds.length > 0
      ? listPublishedFeedForClassrooms({
          classroomIds,
          limit,
          cursor: cursor?.publication ?? null,
        })
      : Promise.resolve({ items: [], nextCursor: null }),
    includeCounts
      ? Promise.all([
          db.card.count({
            where: buildParentPostWhere(studentIds, {}),
          }),
          db.card.count({
            where: buildParentPostWhere(studentIds, { kind: "media" }),
          }),
          db.card.count({
            where: buildParentPostWhere(studentIds, { kind: "text" }),
          }),
        ])
      : Promise.resolve(null),
  ]);

  type MergedEntry =
    | { time: Date; source: "card"; item: ParentPostDTO }
    | { time: Date; source: "publication"; item: ParentFeedPublicationDTO };

  const entries: MergedEntry[] = [
    ...cardPage.items.map((item) => ({
      time: new Date(item.createdAt),
      source: "card" as const,
      item,
    })),
    ...publicationPage.items.map((item) => ({
      time: new Date(item.publishedAt),
      source: "publication" as const,
      item: toParentPublicationDTO(item),
    })),
  ];
  entries.sort((a, b) => {
    if (a.time.getTime() !== b.time.getTime()) {
      return b.time.getTime() - a.time.getTime();
    }
    if (a.source !== b.source) {
      return a.source === "publication" ? -1 : 1;
    }
    return b.item.id.localeCompare(a.item.id);
  });

  const hasMore =
    entries.length > limit || Boolean(publicationPage.nextCursor);
  const pageEntries = entries.slice(0, limit);

  let cardCursor = cursor?.card ?? null;
  let publicationCursor = cursor?.publication ?? null;
  for (const entry of pageEntries) {
    if (entry.source === "card") {
      cardCursor = { createdAt: entry.time, id: entry.item.id };
    } else {
      publicationCursor = {
        publishedAt: entry.time,
        publicationId: entry.item.id,
      };
    }
  }

  const response = {
    items: pageEntries.map((entry) => entry.item),
    nextCursor: hasMore
      ? encodeParentMergedFeedCursor({
          card: cardCursor,
          publication: publicationCursor,
        })
      : null,
  };

  if (!counts) return response;
  const [total, media, text] = counts;
  return { ...response, total, counts: { media, text } };
}

function buildParentPostWhere(
  studentIds: string[],
  options: {
    cursor?: ParentFeedCursor | null;
    kind?: ParentPostKind | null;
  } = {},
): Prisma.CardWhereInput {
  const { cursor = null, kind = null } = options;
  return {
    AND: [
      {
        OR: [
          { studentAuthorId: { in: studentIds } },
          { authors: { some: { studentId: { in: studentIds } } } },
        ],
      },
      { OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }] },
      ...(kind === "media" ? [PARENT_MEDIA_WHERE] : []),
      ...(kind === "text" ? [{ NOT: PARENT_MEDIA_WHERE }] : []),
      ...(cursor
        ? [{
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }]
        : []),
    ],
    board: { layout: { notIn: [...EXCLUDED_BOARD_LAYOUTS] } },
  };
}

function cardHasMedia(card: {
  imageUrl: string | null;
  thumbUrl: string | null;
  videoUrl: string | null;
  linkImage: string | null;
  attachments: Array<{
    kind: string;
    previewUrl: string | null;
  }>;
}): boolean {
  return Boolean(
    card.imageUrl ||
      card.thumbUrl ||
      card.videoUrl ||
      card.linkImage ||
      card.attachments.some(
        (attachment) =>
          attachment.kind === "image" ||
          attachment.kind === "video" ||
          attachment.previewUrl,
      ),
  );
}
