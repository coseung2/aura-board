/**
 * Vercel Blob streaming upload helper (Seed 8 §1.5 / CR-7).
 *
 * Uses `@vercel/blob` `put()` with `multipart: true` when
 * BLOB_READ_WRITE_TOKEN is set. Otherwise falls back to writing under
 * `public/uploads/` for dev/self-host.
 *
 * The input is a PNG data URL (`data:image/png;base64,<b64>`). We decode the
 * base64 body into a Buffer *once* and hand it to put(); the @vercel/blob SDK
 * handles the multipart streaming internally when `multipart: true`.
 *
 * We deliberately do not accumulate more than one decoded copy — request
 * streaming is handled by Next.js framework; we only deal with the already-
 * parsed body. For the 4MB hard guard, see the route handler (CR-4).
 */
import "server-only";
import { randomBytes } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import sharp from "sharp";

export class BlobUploadError extends Error {
  code = "blob_upload_failed" as const;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "BlobUploadError";
  }
}

const DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=_-]+)$/;

export type UploadResult = {
  url: string;
  bytes: number;
  pathname: string;
};

/**
 * Decode a PNG data URL and stream it to Vercel Blob (or fs fallback).
 * Returns the public URL suitable to store as `Card.imageUrl`.
 *
 * `pathname` convention: `external-cards/{boardId}/{cardId}.png`.
 */
export async function uploadPngFromDataUrl(
  dataUrl: string,
  pathname: string
): Promise<UploadResult> {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) {
    throw new BlobUploadError("data URL did not match data:image/png;base64,");
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(m[1], "base64");
  } catch (e) {
    throw new BlobUploadError("base64 decode failed", e);
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    try {
      const res = await put(pathname, buf, {
        access: "public",
        contentType: "image/png",
        token: blobToken,
        multipart: true,
        addRandomSuffix: false,
      });
      return { url: res.url, bytes: buf.byteLength, pathname };
    } catch (e) {
      console.warn("[blob] put() failed, falling back to fs", e);
      // Fall through to fs fallback.
    }
  }

  // fs fallback — public/uploads/... served by Next.js static.
  const safe = `${randomBytes(4).toString("hex")}-${pathname.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const abs = path.join(process.cwd(), "public", "uploads", safe);
  try {
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buf);
    return { url: `/uploads/${safe}`, bytes: buf.byteLength, pathname: safe };
  } catch (e) {
    throw new BlobUploadError("fs fallback write failed", e);
  }
}

/**
 * Fetch `sourceUrl`, resize to a 160×120 WebP thumbnail, upload under
 * `pathname` and return the public URL. AC-12 of the assignment-board
 * feature — called from the student submission route so the teacher grid
 * can render a light thumbnail instead of the full imageUrl. 160×120
 * matches the CSS box the grid already renders (see AssignmentSlotCard).
 *
 * Separate from uploadPngFromDataUrl so existing callers stay untouched.
 */
export async function resizeToWebPThumbUrl(
  sourceUrl: string,
  pathname: string
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new BlobUploadError(`source fetch failed: ${res.status}`);
  }
  const inputBuf = Buffer.from(await res.arrayBuffer());
  const webp = await resizeBufferToWebP(inputBuf);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    const out = await put(pathname, webp, {
      access: "public",
      contentType: "image/webp",
      token: blobToken,
      multipart: false,
      addRandomSuffix: false,
    });
    return out.url;
  }

  // fs fallback mirrors uploadPngFromDataUrl for dev/self-host parity.
  const safe = `${randomBytes(4).toString("hex")}-${pathname.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const abs = path.join(process.cwd(), "public", "uploads", safe);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, webp);
  return `/uploads/${safe}`;
}

/**
 * Exported for the test harness only — the real sharp pipeline is not
 * mockable, so the test drives a PNG buffer through this and inspects the
 * WebP magic bytes. Route code should call `resizeToWebPThumbUrl`.
 */
export async function resizeBufferToWebP(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(160, 120, { fit: "cover" })
    .webp({ quality: 75 })
    .toBuffer();
}
