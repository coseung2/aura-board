import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  deletePublicObjects,
  parseSupabasePublicObjectUrl,
} from "@/lib/media-storage";

const DELETE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60 * 1_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;
const REFERENCED_RETRY_DELAY_MS = 60 * 60 * 1_000;

export type ClaimedBlobDeletion = {
  id: string;
  url: string;
  attempts: number;
  lockToken: string;
};

export type BlobDeletionQueueRun = {
  checked: number;
  deleted: number;
  retained: number;
  failed: number;
  dead: number;
};

/**
 * Given an array of URLs, delete only project-owned Supabase Storage objects.
 * Non-storage URLs (Unsplash, localhost, etc.) are silently skipped.
 *
 * Designed to be fire-and-forget — called after the DB transaction
 * succeeds so a storage API failure never rolls back a deletion.
 */
export async function deleteBlobs(
  urls: (string | null | undefined)[],
): Promise<void> {
  const valid = urls.filter((u): u is string => !!u);
  if (valid.length === 0) return;

  try {
    await deletePublicObjects(valid);
  } catch (e) {
    // Log but never throw — we don't want to break the DB transaction.
    console.warn(
      "[storage-cleanup] Supabase Storage deletion failed (non-fatal):",
      e,
    );
  }
}

export async function enqueueBlobDeletion(
  urls: (string | null | undefined)[],
  source: string,
  resourceType?: string,
  resourceId?: string,
): Promise<void> {
  const storageUrls = urls.filter((u): u is string => isManagedStorageUrl(u));
  if (storageUrls.length === 0) return;
  const deleteAfter = new Date(Date.now() + DELETE_DELAY_MS);
  await db.blobDeletionQueue.createMany({
    data: [...new Set(storageUrls)].map((url) => ({
      url,
      source,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      deleteAfter,
      nextAttemptAt: deleteAfter,
      status: "pending",
      terminal: false,
    })),
  });
}

export async function claimBlobDeletionQueue(
  batchSize = DEFAULT_BATCH_SIZE,
  now = new Date(),
): Promise<ClaimedBlobDeletion[]> {
  const take = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(batchSize)));
  const lockToken = randomUUID();
  const leaseExpiredBefore = new Date(now.getTime() - LEASE_MS);

  return db.$transaction((tx) =>
    tx.$queryRaw<ClaimedBlobDeletion[]>(
      Prisma.sql`
      WITH terminalized AS (
        UPDATE "BlobDeletionQueue"
        SET "status" = 'dead',
            "terminal" = true,
            "lockedAt" = NULL,
            "lockToken" = NULL,
            "nextAttemptAt" = ${now},
            "lastError" = COALESCE(
              "lastError",
              CASE WHEN "status" = 'processing' THEN 'lease_expired' ELSE 'max_attempts' END
            ),
            "updatedAt" = ${now}
        WHERE "deletedAt" IS NULL
          AND "terminal" = false
          AND "attempts" >= ${MAX_ATTEMPTS}
          AND (
            "status" = 'pending'
            OR (
              "status" = 'processing'
              AND ("lockedAt" IS NULL OR "lockedAt" <= ${leaseExpiredBefore})
            )
          )
        RETURNING "id"
      ), one_per_url AS (
        SELECT DISTINCT ON (candidate."url") candidate."id"
        FROM "BlobDeletionQueue" AS candidate
        WHERE candidate."deletedAt" IS NULL
          AND candidate."terminal" = false
          AND candidate."attempts" < ${MAX_ATTEMPTS}
          AND (
            (
              candidate."status" = 'pending'
              AND candidate."nextAttemptAt" <= ${now}
            )
            OR (
              candidate."status" = 'processing'
              AND (
                candidate."lockedAt" IS NULL
                OR candidate."lockedAt" <= ${leaseExpiredBefore}
              )
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "BlobDeletionQueue" AS active
            WHERE active."id" <> candidate."id"
              AND active."url" = candidate."url"
              AND active."status" = 'processing'
              AND active."terminal" = false
              AND (
                active."lockedAt" IS NULL
                OR active."lockedAt" > ${leaseExpiredBefore}
              )
          )
        ORDER BY candidate."url", candidate."nextAttemptAt" ASC,
                 candidate."createdAt" ASC, candidate."id" ASC
      ), candidates AS (
        SELECT queue."id"
        FROM "BlobDeletionQueue" AS queue
        JOIN one_per_url ON one_per_url."id" = queue."id"
        WHERE queue."deletedAt" IS NULL
          AND queue."terminal" = false
          AND queue."attempts" < ${MAX_ATTEMPTS}
          AND (
            (
              queue."status" = 'pending'
              AND queue."nextAttemptAt" <= ${now}
            )
            OR (
              queue."status" = 'processing'
              AND (queue."lockedAt" IS NULL OR queue."lockedAt" <= ${leaseExpiredBefore})
            )
          )
        ORDER BY queue."nextAttemptAt" ASC, queue."createdAt" ASC, queue."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${take}
      )
      UPDATE "BlobDeletionQueue" AS queue
      SET "status" = 'processing',
          "attempts" = queue."attempts" + 1,
          "lockedAt" = ${now},
          "lockToken" = ${lockToken},
          "updatedAt" = ${now}
      FROM candidates
      WHERE queue."id" = candidates."id"
      RETURNING queue."id", queue."url", queue."attempts", queue."lockToken"
    `,
    ),
  );
}

export async function processBlobDeletionQueue(
  limit = DEFAULT_BATCH_SIZE,
  now = new Date(),
): Promise<BlobDeletionQueueRun> {
  const claimed = await claimBlobDeletionQueue(limit, now);
  const result: BlobDeletionQueueRun = {
    checked: claimed.length,
    deleted: 0,
    retained: 0,
    failed: 0,
    dead: 0,
  };

  for (const item of claimed) {
    if (!isManagedStorageUrl(item.url)) {
      const failure = await releaseFailedBlob(
        item,
        "unsupported_storage_url",
        now,
        true,
      );
      if (failure.updated) {
        result.failed += 1;
        if (failure.terminal) result.dead += 1;
      }
      continue;
    }

    if (await isStorageUrlReferenced(item.url)) {
      const retained = await db.blobDeletionQueue.updateMany({
        where: { id: item.id, lockToken: item.lockToken, status: "processing" },
        data: {
          attempts: 0,
          status: "pending",
          terminal: false,
          nextAttemptAt: new Date(now.getTime() + REFERENCED_RETRY_DELAY_MS),
          lockedAt: null,
          lockToken: null,
          lastError: "still_referenced",
          updatedAt: now,
        },
      });
      if (retained.count === 1) result.retained += 1;
      continue;
    }

    try {
      await deletePublicObjects([item.url]);
      const completed = await db.blobDeletionQueue.updateMany({
        where: { id: item.id, lockToken: item.lockToken, status: "processing" },
        data: {
          status: "done",
          terminal: true,
          deletedAt: now,
          nextAttemptAt: now,
          lockedAt: null,
          lockToken: null,
          lastError: null,
          updatedAt: now,
        },
      });
      if (completed.count === 1) result.deleted += 1;
    } catch (error) {
      const failure = await releaseFailedBlob(
        item,
        formatBlobCleanupError(error),
        now,
        isPermanentBlobCleanupError(error),
      );
      if (failure.updated) {
        result.failed += 1;
        if (failure.terminal) result.dead += 1;
      }
    }
  }

  return result;
}

export function blobRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(7, Math.trunc(attempts) - 1));
  return Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** exponent);
}

function isManagedStorageUrl(url: string | null | undefined): boolean {
  return Boolean(parseSupabasePublicObjectUrl(url));
}

async function isStorageUrlReferenced(url: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ referenced: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM (
        SELECT 1 FROM "Card"
        WHERE "imageUrl" = ${url}
           OR "thumbUrl" = ${url}
           OR "linkImage" = ${url}
           OR "videoUrl" = ${url}
           OR "fileUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "CardAttachment"
        WHERE "url" = ${url} OR "previewUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "StudentAsset"
        WHERE "fileUrl" = ${url} OR "thumbnailUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "Submission"
        WHERE "fileUrl" = ${url} OR "videoThumbnail" = ${url}
        UNION ALL
        SELECT 1 FROM "Board"
        WHERE "thumbnailUrl" = ${url} OR "eventPosterUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "VibeProject"
        WHERE "thumbnailUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "PlantObservationImage"
        WHERE "url" = ${url} OR "thumbnailUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "DjPlayEvent"
        WHERE "linkImage" = ${url}
        UNION ALL
        SELECT 1 FROM "User"
        WHERE "image" = ${url} OR "appBackgroundUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "DailyBannerSubmission"
        WHERE "imageUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "StoreItem"
        WHERE "imageUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "AvatarItem"
        WHERE "imageUrl" = ${url} OR "thumbnailUrl" = ${url}
        UNION ALL
        SELECT 1 FROM "TeacherLibraryItem"
        WHERE "assetUrl" = ${url} OR "previewUrl" = ${url}
      ) AS "storage_references"
      LIMIT 1
    ) AS "referenced"
  `);
  return rows[0]?.referenced === true;
}

async function releaseFailedBlob(
  item: ClaimedBlobDeletion,
  error: string,
  now: Date,
  permanent: boolean,
): Promise<{ updated: boolean; terminal: boolean }> {
  const terminal = permanent || item.attempts >= MAX_ATTEMPTS;
  const updated = await db.blobDeletionQueue.updateMany({
    where: { id: item.id, lockToken: item.lockToken, status: "processing" },
    data: {
      status: terminal ? "dead" : "pending",
      terminal,
      nextAttemptAt: terminal
        ? now
        : new Date(now.getTime() + blobRetryDelayMs(item.attempts)),
      lockedAt: null,
      lockToken: null,
      lastError: error,
      updatedAt: now,
    },
  });
  return { updated: updated.count === 1, terminal };
}

function formatBlobCleanupError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500) || error.name;
  if (typeof error === "string") return error.slice(0, 500);
  return "delete_failed";
}

function isPermanentBlobCleanupError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { permanent?: unknown; code?: unknown };
  return (
    candidate.permanent === true || candidate.code === "unsupported_storage_url"
  );
}
