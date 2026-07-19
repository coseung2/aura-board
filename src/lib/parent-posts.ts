import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { decodeParentFeedCursor, encodeParentFeedCursor } from "./parent-feed-cursor";
import type { ParentFeedCursor } from "./parent-feed-cursor";
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

export function parseParentPostKind(
  searchParams: URLSearchParams,
): ParentPostKind | null | { error: "invalid_kind" } {
  const kind = searchParams.get("kind");
  if (kind === null) return null;
  if (kind === "media" || kind === "text") return kind;
  return { error: "invalid_kind" };
}

export function parseParentPostFocus(
  searchParams: URLSearchParams,
): string | null | { error: "invalid_post" } {
  const rawPostId = searchParams.get("post");
  if (rawPostId === null) return null;
  const postId = rawPostId.trim();
  if (!postId || postId.length > 200) return { error: "invalid_post" };
  return postId;
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
  startAt = null,
}: {
  children: ParentChildSummary[];
  limit: number;
  cursor: ParentFeedCursor | null;
  kind?: ParentPostKind | null;
  startAt?: ParentFeedCursor | null;
}): Promise<{ items: ParentPostDTO[]; nextCursor: string | null }> {
  const studentIds = children.map((child) => child.id);
  if (studentIds.length === 0) return { items: [], nextCursor: null };

  const rows = await db.card.findMany({
    where: buildParentPostWhere(studentIds, { cursor, kind, startAt }),
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
      _count: { select: { likes: true, comments: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map((card): ParentPostDTO => {
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
  const last = pageRows.at(-1);

  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeParentFeedCursor({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}

export async function findParentPostFocus(
  children: ParentChildSummary[],
  postId: string,
): Promise<ParentFeedCursor | null> {
  const studentIds = children.map((child) => child.id);
  if (studentIds.length === 0) return null;

  const post = await db.card.findFirst({
    where: {
      AND: [buildParentPostWhere(studentIds), { id: postId }],
    },
    select: { id: true, createdAt: true },
  });
  return post ? { id: post.id, createdAt: post.createdAt } : null;
}

function buildParentPostWhere(
  studentIds: string[],
  options: {
    cursor?: ParentFeedCursor | null;
    kind?: ParentPostKind | null;
    startAt?: ParentFeedCursor | null;
  } = {},
): Prisma.CardWhereInput {
  const { cursor = null, kind = null, startAt = null } = options;
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
      ...(startAt
        ? [{
            OR: [
              { createdAt: { lt: startAt.createdAt } },
              { createdAt: startAt.createdAt, id: { lte: startAt.id } },
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
