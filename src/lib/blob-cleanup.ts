/**
 * Blob cleanup utility — automatically deletes Vercel Blob files when
 * associated DB records are deleted.
 *
 * Called from Prisma middleware in `db.ts`. Never throws — all errors
 * are logged and swallowed so deletion transactions are never blocked
 * by a failed Blob API call.
 *
 * Note: intentionally avoids Node.js-specific imports (fs/promises, path)
 * and "server-only" so the module doesn't break client-side bundling.
 * The dynamic import in db.ts makes this safe to reference.
 */
import { del } from "@vercel/blob";

const BLOB_HOST = "public.blob.vercel-storage.com";

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
