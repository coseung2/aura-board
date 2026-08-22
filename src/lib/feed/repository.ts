import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import type {
  FeedAuthorKind,
  FeedHiddenReason,
  FeedItem,
  FeedMedia,
  FeedMediaInput,
  FeedPage,
  FeedPoolItem,
  FeedPublicationScope,
  FeedPostStatus,
} from "./types";
import { encodeFeedCursor, type FeedCursor } from "./validation";

type FeedActor = {
  kind: FeedAuthorKind;
  displayName: string;
  userId?: string | null;
  studentId?: string | null;
};

export type FeedViewer =
  | { kind: "student"; id: string; name: string; classroomId: string }
  | { kind: "teacher"; id: string; name: string };

export type FeedTargetKind = "post" | "comment";

export type FeedHiddenState = {
  targetKeys: Set<string>;
  authorIds: Set<string>;
};

type CreateFeedPostInput = {
  actor: FeedActor;
  title: string | null;
  body: string | null;
  media: FeedMediaInput[];
  status?: FeedPostStatus;
  publication?: {
    scope: FeedPublicationScope;
    classroomId?: string | null;
    publishedByUserId?: string | null;
    publishedByStudentId?: string | null;
  } | null;
  poolCreatedByUserId?: string | null;
};

type FeedRow = {
  publicationId: string;
  postId: string;
  scope: FeedPublicationScope;
  classroomId: string | null;
  authorKind: FeedAuthorKind;
  authorUserId: string | null;
  authorStudentId: string | null;
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  publishedAt: Date;
  media: FeedMedia[];
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
};

type FeedPoolRow = {
  postId: string;
  authorKind: FeedAuthorKind;
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  createdAt: Date;
  media: FeedMedia[];
};

export async function getCurrentFeedViewer(): Promise<FeedViewer | null> {
  const student = await getCurrentStudent().catch(() => null);
  if (student) {
    return {
      kind: "student",
      id: student.id,
      name: student.name,
      classroomId: student.classroomId,
    };
  }

  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;
  return {
    kind: "teacher",
    id: user.id,
    name: user.name?.trim() || user.email,
  };
}

export async function loadFeedHiddenState(viewer: FeedViewer | null): Promise<FeedHiddenState | null> {
  if (!viewer || viewer.kind !== "student") return null;

  const [targets, authors] = await Promise.all([
    db.feedHiddenContent.findMany({
      where: { studentId: viewer.id },
      select: { targetKind: true, targetId: true },
    }),
    db.hiddenContentAuthor.findMany({
      where: { studentId: viewer.id },
      select: { hiddenStudentId: true },
    }),
  ]);

  return {
    targetKeys: new Set(targets.map((target) => `${target.targetKind}:${target.targetId}`)),
    authorIds: new Set(authors.map((author) => author.hiddenStudentId)),
  };
}

export function feedHiddenReason(
  hidden: FeedHiddenState | null,
  targetKind: FeedTargetKind,
  targetId: string,
  authorStudentId: string | null,
): FeedHiddenReason | null {
  if (!hidden) return null;
  if (
    hidden.targetKeys.has(`${targetKind}:${targetId}`) ||
    hidden.targetKeys.has(`feed_${targetKind}:${targetId}`)
  ) return "item";
  if (authorStudentId && hidden.authorIds.has(authorStudentId)) return "author";
  return null;
}

function viewerLikeSql(viewer: FeedViewer | null, alias: "post" | "comment") {
  if (!viewer) return Prisma.sql`FALSE`;
  if (alias === "post" && viewer.kind === "student") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FeedPostLike" viewer_like
      WHERE viewer_like."postId" = post."id"
        AND viewer_like."likerStudentId" = ${viewer.id}
    )`;
  }
  if (alias === "post") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FeedPostLike" viewer_like
      WHERE viewer_like."postId" = post."id"
        AND viewer_like."likerUserId" = ${viewer.id}
    )`;
  }
  if (viewer.kind === "student") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "FeedCommentLike" viewer_like
      WHERE viewer_like."commentId" = comment."id"
        AND viewer_like."likerStudentId" = ${viewer.id}
    )`;
  }
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "FeedCommentLike" viewer_like
    WHERE viewer_like."commentId" = comment."id"
      AND viewer_like."likerUserId" = ${viewer.id}
  )`;
}

export async function createFeedPost(input: CreateFeedPostInput) {
  const postId = randomUUID();
  const publicationId = input.publication ? randomUUID() : null;
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "FeedPost" (
        "id", "authorKind", "authorDisplayName", "authorUserId", "authorStudentId",
        "title", "body", "status", "createdAt", "updatedAt"
      ) VALUES (
        ${postId}, ${input.actor.kind}, ${input.actor.displayName},
        ${input.actor.userId ?? null}, ${input.actor.studentId ?? null},
        ${input.title}, ${input.body}, ${input.status ?? "PUBLISHED"}, ${now}, ${now}
      )
    `);

    for (const [position, media] of input.media.entries()) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FeedPostMedia" (
          "id", "postId", "kind", "url", "youtubeVideoId", "altText",
          "position", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${postId}, ${media.kind}, ${media.url},
          ${media.youtubeVideoId ?? null}, ${media.altText ?? null},
          ${position}, ${now}, ${now}
        )
      `);
    }

    if (input.publication && publicationId) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FeedPublication" (
          "id", "postId", "scope", "classroomId", "status",
          "publishedByUserId", "publishedByStudentId", "publishedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${publicationId}, ${postId}, ${input.publication.scope},
          ${input.publication.classroomId ?? null}, 'ACTIVE',
          ${input.publication.publishedByUserId ?? null},
          ${input.publication.publishedByStudentId ?? null},
          ${now}, ${now}, ${now}
        )
      `);
    }

    if (input.poolCreatedByUserId) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FeedPoolEntry" (
          "postId", "status", "createdByUserId", "createdAt", "updatedAt"
        ) VALUES (
          ${postId}, 'AVAILABLE', ${input.poolCreatedByUserId}, ${now}, ${now}
        )
      `);
    }
  });

  return { postId, publicationId };
}

export async function listPublishedFeed(input: {
  scope: FeedPublicationScope;
  classroomId?: string | null;
  limit: number;
  cursor: FeedCursor | null;
}): Promise<FeedPage> {
  const viewer = await getCurrentFeedViewer();
  const hidden = await loadFeedHiddenState(viewer);
  const cursorFilter = input.cursor
    ? Prisma.sql`
        AND (
          publication."publishedAt" < ${input.cursor.publishedAt}
          OR (
            publication."publishedAt" = ${input.cursor.publishedAt}
            AND publication."id" < ${input.cursor.publicationId}
          )
        )
      `
    : Prisma.sql``;

  const targetFilter =
    input.scope === "CLASSROOM"
      ? Prisma.sql`AND publication."classroomId" = ${input.classroomId ?? null}`
      : Prisma.sql`AND publication."classroomId" IS NULL`;

  const rows = await db.$queryRaw<FeedRow[]>(Prisma.sql`
    SELECT
      publication."id" AS "publicationId",
      post."id" AS "postId",
      publication."scope" AS "scope",
      publication."classroomId" AS "classroomId",
      post."authorKind" AS "authorKind",
      post."authorUserId" AS "authorUserId",
      post."authorStudentId" AS "authorStudentId",
      post."authorDisplayName" AS "authorDisplayName",
      post."title" AS "title",
      post."body" AS "body",
      publication."publishedAt" AS "publishedAt",
      (
        SELECT COUNT(*)::int FROM "FeedPostLike" post_like
        WHERE post_like."postId" = post."id"
      ) AS "likeCount",
      (
        SELECT COUNT(*)::int FROM "FeedComment" feed_comment
        WHERE feed_comment."postId" = post."id"
          AND feed_comment."deletedAt" IS NULL
      ) AS "commentCount",
      ${viewerLikeSql(viewer, "post")} AS "isLiked",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', media."id",
              'kind', media."kind",
              'url', media."url",
              'youtubeVideoId', media."youtubeVideoId",
              'altText', media."altText",
              'position', media."position"
            ) ORDER BY media."position" ASC
          )
          FROM "FeedPostMedia" media
          WHERE media."postId" = post."id"
        ),
        '[]'::json
      ) AS "media"
    FROM "FeedPublication" publication
    INNER JOIN "FeedPost" post ON post."id" = publication."postId"
    WHERE publication."scope" = ${input.scope}
      AND publication."status" = 'ACTIVE'
      AND post."status" = 'PUBLISHED'
      ${targetFilter}
      ${cursorFilter}
    ORDER BY publication."publishedAt" DESC, publication."id" DESC
    LIMIT ${input.limit + 1}
  `);

  const hasMore = rows.length > input.limit;
  const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;
  const last = visibleRows.at(-1);

  return {
    items: visibleRows.map((row) => toFeedItem(row, hidden, viewer)),
    nextCursor:
      hasMore && last
        ? encodeFeedCursor({
            publishedAt: last.publishedAt,
            publicationId: last.publicationId,
          })
        : null,
  };
}

/**
 * Feed for a set of classrooms: every GLOBAL publication plus every
 * CLASSROOM publication targeting one of the given classrooms, in one
 * time-ordered stream. Used by the student feed, which no longer separates
 * "our class" and "global" into tabs.
 */
export async function listPublishedFeedForClassrooms(input: {
  classroomIds: string[];
  limit: number;
  cursor: FeedCursor | null;
}): Promise<FeedPage> {
  const viewer = await getCurrentFeedViewer();
  const hidden = await loadFeedHiddenState(viewer);
  const cursorFilter = input.cursor
    ? Prisma.sql`
        AND (
          publication."publishedAt" < ${input.cursor.publishedAt}
          OR (
            publication."publishedAt" = ${input.cursor.publishedAt}
            AND publication."id" < ${input.cursor.publicationId}
          )
        )
      `
    : Prisma.sql``;

  const audienceFilter =
    input.classroomIds.length === 0
      ? Prisma.sql`AND publication."classroomId" IS NULL`
      : Prisma.sql`AND (
          publication."classroomId" IS NULL
          OR publication."classroomId" IN (${Prisma.join(input.classroomIds)})
        )`;

  const rows = await db.$queryRaw<FeedRow[]>(Prisma.sql`
    SELECT
      publication."id" AS "publicationId",
      post."id" AS "postId",
      publication."scope" AS "scope",
      publication."classroomId" AS "classroomId",
      post."authorKind" AS "authorKind",
      post."authorUserId" AS "authorUserId",
      post."authorStudentId" AS "authorStudentId",
      post."authorDisplayName" AS "authorDisplayName",
      post."title" AS "title",
      post."body" AS "body",
      publication."publishedAt" AS "publishedAt",
      (
        SELECT COUNT(*)::int FROM "FeedPostLike" post_like
        WHERE post_like."postId" = post."id"
      ) AS "likeCount",
      (
        SELECT COUNT(*)::int FROM "FeedComment" feed_comment
        WHERE feed_comment."postId" = post."id"
          AND feed_comment."deletedAt" IS NULL
      ) AS "commentCount",
      ${viewerLikeSql(viewer, "post")} AS "isLiked",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', media."id",
              'kind', media."kind",
              'url', media."url",
              'youtubeVideoId', media."youtubeVideoId",
              'altText', media."altText",
              'position', media."position"
            ) ORDER BY media."position" ASC
          )
          FROM "FeedPostMedia" media
          WHERE media."postId" = post."id"
        ),
        '[]'::json
      ) AS "media"
    FROM "FeedPublication" publication
    INNER JOIN "FeedPost" post ON post."id" = publication."postId"
    WHERE publication."status" = 'ACTIVE'
      AND post."status" = 'PUBLISHED'
      ${audienceFilter}
      ${cursorFilter}
    ORDER BY publication."publishedAt" DESC, publication."id" DESC
    LIMIT ${input.limit + 1}
  `);

  const hasMore = rows.length > input.limit;
  const visibleRows = hasMore ? rows.slice(0, input.limit) : rows;
  const last = visibleRows.at(-1);

  return {
    items: visibleRows.map((row) => toFeedItem(row, hidden, viewer)),
    nextCursor:
      hasMore && last
        ? encodeFeedCursor({
            publishedAt: last.publishedAt,
            publicationId: last.publicationId,
          })
        : null,
  };
}

export async function listAvailablePool(limit = 50): Promise<FeedPoolItem[]> {
  const rows = await db.$queryRaw<FeedPoolRow[]>(Prisma.sql`
    SELECT
      post."id" AS "postId",
      post."authorKind" AS "authorKind",
      post."authorDisplayName" AS "authorDisplayName",
      post."title" AS "title",
      post."body" AS "body",
      pool."createdAt" AS "createdAt",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', media."id",
              'kind', media."kind",
              'url', media."url",
              'youtubeVideoId', media."youtubeVideoId",
              'altText', media."altText",
              'position', media."position"
            ) ORDER BY media."position" ASC
          )
          FROM "FeedPostMedia" media
          WHERE media."postId" = post."id"
        ),
        '[]'::json
      ) AS "media"
    FROM "FeedPoolEntry" pool
    INNER JOIN "FeedPost" post ON post."id" = pool."postId"
    WHERE pool."status" = 'AVAILABLE'
      AND post."status" = 'PUBLISHED'
    ORDER BY pool."createdAt" DESC, post."id" DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    media: Array.isArray(row.media) ? row.media : [],
  }));
}

export async function publishPoolPostToClassrooms(input: {
  postId: string;
  classroomIds: string[];
  publishedByUserId: string;
}) {
  const uniqueClassroomIds = [...new Set(input.classroomIds)];
  const now = new Date();

  return db.$transaction(async (tx) => {
    const available = await tx.$queryRaw<Array<{ postId: string }>>(Prisma.sql`
      SELECT pool."postId" AS "postId"
      FROM "FeedPoolEntry" pool
      INNER JOIN "FeedPost" post ON post."id" = pool."postId"
      WHERE pool."postId" = ${input.postId}
        AND pool."status" = 'AVAILABLE'
        AND post."status" = 'PUBLISHED'
      LIMIT 1
    `);

    if (available.length === 0) return { found: false, published: 0 };

    for (const classroomId of uniqueClassroomIds) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FeedPublication" (
          "id", "postId", "scope", "classroomId", "status",
          "publishedByUserId", "publishedByStudentId", "publishedAt", "removedAt",
          "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${input.postId}, 'CLASSROOM', ${classroomId}, 'ACTIVE',
          ${input.publishedByUserId}, NULL, ${now}, NULL, ${now}, ${now}
        )
        ON CONFLICT ("postId", "classroomId") WHERE "scope" = 'CLASSROOM'
        DO UPDATE SET
          "status" = 'ACTIVE',
          "publishedByUserId" = EXCLUDED."publishedByUserId",
          "publishedByStudentId" = NULL,
          "publishedAt" = CASE
            WHEN "FeedPublication"."status" = 'ACTIVE'
              THEN "FeedPublication"."publishedAt"
            ELSE EXCLUDED."publishedAt"
          END,
          "removedAt" = NULL,
          "updatedAt" = EXCLUDED."updatedAt"
      `);
    }

    return { found: true, published: uniqueClassroomIds.length };
  });
}

const feedPostSelect = {
  id: true,
  status: true,
  authorUserId: true,
  authorStudentId: true,
  authorDisplayName: true,
} as const;

function accessiblePublicationWhere(viewer: FeedViewer) {
  return viewer.kind === "student"
    ? { status: "ACTIVE", OR: [{ classroomId: null }, { classroomId: viewer.classroomId }] }
    : { status: "ACTIVE", scope: "CLASSROOM", classroom: { teacherId: viewer.id } };
}

export async function findAccessibleFeedPost(
  postId: string,
  viewer: FeedViewer,
  includeArchived = false,
) {
  return db.feedPost.findFirst({
    where: {
      id: postId,
      ...(includeArchived ? {} : { status: "PUBLISHED" }),
      publications: { some: accessiblePublicationWhere(viewer) },
    },
    select: feedPostSelect,
  });
}

function viewerLikeWhere(viewer: FeedViewer) {
  return viewer.kind === "student"
    ? { likerStudentId: viewer.id }
    : { likerUserId: viewer.id };
}

export async function toggleFeedPostLike(input: {
  postId: string;
  viewer: FeedViewer;
  desiredLiked: boolean | undefined;
}) {
  if (!(await findAccessibleFeedPost(input.postId, input.viewer))) return null;
  const where = { postId: input.postId, ...viewerLikeWhere(input.viewer) };
  let liked: boolean;
  if (input.desiredLiked === false) {
    await db.feedPostLike.deleteMany({ where });
    liked = false;
  } else if (input.desiredLiked === true) {
    await db.feedPostLike.createMany({
      data: input.viewer.kind === "student"
        ? { postId: input.postId, likerKind: "student", likerStudentId: input.viewer.id }
        : { postId: input.postId, likerKind: "teacher", likerUserId: input.viewer.id },
      skipDuplicates: true,
    });
    liked = true;
  } else {
    const removed = await db.feedPostLike.deleteMany({ where });
    if (removed.count > 0) liked = false;
    else {
      await db.feedPostLike.createMany({
        data: input.viewer.kind === "student"
          ? { postId: input.postId, likerKind: "student", likerStudentId: input.viewer.id }
          : { postId: input.postId, likerKind: "teacher", likerUserId: input.viewer.id },
        skipDuplicates: true,
      });
      liked = true;
    }
  }
  const count = await db.feedPostLike.count({ where: { postId: input.postId } });
  return { liked, count };
}

export async function deleteFeedPost(postId: string, viewer: FeedViewer) {
  const post = await findAccessibleFeedPost(postId, viewer, true);
  if (!post) return "not_found" as const;
  if (viewer.kind === "student" && post.authorStudentId !== viewer.id) {
    return "forbidden" as const;
  }
  if (post.status === "ARCHIVED") return "already_deleted" as const;
  await db.feedPost.update({ where: { id: postId }, data: { status: "ARCHIVED" } });
  return "deleted" as const;
}

function toFeedItem(
  row: FeedRow,
  hidden: FeedHiddenState | null = null,
  viewer: FeedViewer | null = null,
): FeedItem {
  const authorId = row.authorStudentId ?? row.authorUserId;
  const hiddenReason = feedHiddenReason(hidden, "post", row.postId, row.authorStudentId);
  const own = viewer?.kind === "student"
    ? row.authorStudentId === viewer.id
    : viewer?.kind === "teacher"
      ? row.authorUserId === viewer.id
      : false;
  return {
    publicationId: row.publicationId,
    postId: row.postId,
    scope: row.scope,
    classroomId: row.classroomId,
    authorKind: row.authorKind.toUpperCase() as FeedAuthorKind,
    authorId,
    authorDisplayName: row.authorDisplayName,
    title: hiddenReason ? null : row.title,
    body: hiddenReason ? null : row.body,
    publishedAt: row.publishedAt.toISOString(),
    media: hiddenReason ? [] : Array.isArray(row.media) ? row.media : [],
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    isLiked: row.isLiked,
    canDelete: Boolean(viewer) && (own || viewer?.kind === "teacher"),
    canHide: viewer?.kind === "student" && !own && !hiddenReason,
    canReport: viewer?.kind === "student" && !own,
    canBlockAuthor:
      viewer?.kind === "student" &&
      row.authorKind === "STUDENT" &&
      Boolean(row.authorStudentId) &&
      !own &&
      hiddenReason !== "author",
    hiddenReason,
  };
}
