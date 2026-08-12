import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type {
  FeedAuthorKind,
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
  authorDisplayName: string;
  title: string | null;
  body: string | null;
  publishedAt: Date;
  media: FeedMedia[];
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
      post."authorDisplayName" AS "authorDisplayName",
      post."title" AS "title",
      post."body" AS "body",
      publication."publishedAt" AS "publishedAt",
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
    items: visibleRows.map(toFeedItem),
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

function toFeedItem(row: FeedRow): FeedItem {
  return {
    ...row,
    publishedAt: row.publishedAt.toISOString(),
    media: Array.isArray(row.media) ? row.media : [],
  };
}
