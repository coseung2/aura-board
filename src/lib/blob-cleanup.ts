import { del } from "@vercel/blob";
import { db } from "@/lib/db";

const BLOB_HOST = "public.blob.vercel-storage.com";
const DELETE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Given an array of URLs, delete only those that live on Vercel Blob.
 * Non-Blob URLs (Unsplash, localhost, etc.) are silently skipped.
 *
 * Designed to be fire-and-forget — called after the DB transaction
 * succeeds so a Blob API failure never rolls back a deletion.
 */
export async function deleteBlobs(urls: (string | null | undefined)[]): Promise<void> {
  const valid = urls.filter((u): u is string => !!u);
  if (valid.length === 0) return;

  const blobUrls: string[] = [];

  for (const url of valid) {
    try {
      const u = new URL(url);
      if (u.hostname.endsWith(BLOB_HOST)) {
        blobUrls.push(url);
      }
      // Non-Blob URLs (Unsplash, local /uploads/, etc.) — skip
    } catch {
      // Invalid URL — skip
    }
  }

  if (blobUrls.length === 0) return;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn("[blob-cleanup] BLOB_READ_WRITE_TOKEN not set — skipping");
    return;
  }

  try {
    await del(blobUrls, { token });
  } catch (e) {
    // Log but never throw — we don't want to break the DB transaction.
    console.warn("[blob-cleanup] Vercel Blob deletion failed (non-fatal):", e);
  }
}

export async function enqueueBlobDeletion(
  urls: (string | null | undefined)[],
  source: string,
  resourceType?: string,
  resourceId?: string
): Promise<void> {
  const blobUrls = urls.filter((u): u is string => isVercelBlobUrl(u));
  if (blobUrls.length === 0) return;
  const deleteAfter = new Date(Date.now() + DELETE_DELAY_MS);
  await db.blobDeletionQueue.createMany({
    data: [...new Set(blobUrls)].map((url) => ({
      url,
      source,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      deleteAfter,
    })),
  });
}

export async function processBlobDeletionQueue(limit = 25): Promise<{
  checked: number;
  deleted: number;
  retained: number;
  failed: number;
}> {
  const due = await db.blobDeletionQueue.findMany({
    where: {
      deletedAt: null,
      deleteAfter: { lte: new Date() },
    },
    orderBy: { deleteAfter: "asc" },
    take: limit,
  });
  if (due.length === 0) {
    return { checked: 0, deleted: 0, retained: 0, failed: 0 };
  }

  let deleted = 0;
  let retained = 0;
  let failed = 0;
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  for (const item of due) {
    const stillReferenced = await isBlobUrlReferenced(item.url);
    if (stillReferenced) {
      retained += 1;
      await db.blobDeletionQueue.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 }, lastError: "still_referenced" },
      });
      continue;
    }
    if (!token) {
      failed += 1;
      await db.blobDeletionQueue.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 }, lastError: "missing_blob_token" },
      });
      continue;
    }
    try {
      await del(item.url, { token });
      deleted += 1;
      await db.blobDeletionQueue.update({
        where: { id: item.id },
        data: { deletedAt: new Date(), lastError: null },
      });
    } catch (e) {
      failed += 1;
      await db.blobDeletionQueue.update({
        where: { id: item.id },
        data: {
          attempts: { increment: 1 },
          lastError: e instanceof Error ? e.message.slice(0, 500) : "delete_failed",
        },
      });
    }
  }

  return { checked: due.length, deleted, retained, failed };
}

function isVercelBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith(BLOB_HOST);
  } catch {
    return false;
  }
}

async function isBlobUrlReferenced(url: string): Promise<boolean> {
  const [
    cardCount,
    attachmentCount,
    studentAssetCount,
    submissionCount,
    boardCount,
    vibeProjectCount,
    plantImageCount,
    djPlayEventCount,
  ] = await Promise.all([
    db.card.count({
      where: {
        OR: [
          { imageUrl: url },
          { thumbUrl: url },
          { linkImage: url },
          { videoUrl: url },
          { fileUrl: url },
        ],
      },
    }),
    db.cardAttachment.count({ where: { OR: [{ url }, { previewUrl: url }] } }),
    db.studentAsset.count({ where: { OR: [{ fileUrl: url }, { thumbnailUrl: url }] } }),
    db.submission.count({
      where: { OR: [{ fileUrl: url }, { videoThumbnail: url }] },
    }),
    db.board.count({ where: { eventPosterUrl: url } }),
    db.vibeProject.count({ where: { thumbnailUrl: url } }),
    db.plantObservationImage.count({
      where: { OR: [{ url }, { thumbnailUrl: url }] },
    }),
    db.djPlayEvent.count({ where: { linkImage: url } }),
  ]);
  return (
    cardCount +
      attachmentCount +
      studentAssetCount +
      submissionCount +
      boardCount +
      vibeProjectCount +
      plantImageCount +
      djPlayEventCount >
    0
  );
}
