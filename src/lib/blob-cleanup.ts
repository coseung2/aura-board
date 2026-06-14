import { db } from "@/lib/db";
import {
  deletePublicObjects,
  parseSupabasePublicObjectUrl,
} from "@/lib/media-storage";

const DELETE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Given an array of URLs, delete only project-owned Supabase Storage objects.
 * Non-storage URLs (Unsplash, localhost, etc.) are silently skipped.
 *
 * Designed to be fire-and-forget — called after the DB transaction
 * succeeds so a storage API failure never rolls back a deletion.
 */
export async function deleteBlobs(urls: (string | null | undefined)[]): Promise<void> {
  const valid = urls.filter((u): u is string => !!u);
  if (valid.length === 0) return;

  try {
    await deletePublicObjects(valid);
  } catch (e) {
    // Log but never throw — we don't want to break the DB transaction.
    console.warn("[storage-cleanup] Supabase Storage deletion failed (non-fatal):", e);
  }
}

export async function enqueueBlobDeletion(
  urls: (string | null | undefined)[],
  source: string,
  resourceType?: string,
  resourceId?: string
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

  for (const item of due) {
    const stillReferenced = await isStorageUrlReferenced(item.url);
    if (stillReferenced) {
      retained += 1;
      await db.blobDeletionQueue.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 }, lastError: "still_referenced" },
      });
      continue;
    }

    if (!isManagedStorageUrl(item.url)) {
      failed += 1;
      await db.blobDeletionQueue.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 }, lastError: "unsupported_storage_url" },
      });
      continue;
    }

    try {
      await deletePublicObjects([item.url]);
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

function isManagedStorageUrl(url: string | null | undefined): boolean {
  return Boolean(parseSupabasePublicObjectUrl(url));
}

async function isStorageUrlReferenced(url: string): Promise<boolean> {
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
