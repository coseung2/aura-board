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
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { uploadPublicObject } from "@/lib/media-storage";

ffmpeg.setFfmpegPath(ffmpegStatic || "");

export class BlobUploadError extends Error {
  code = "blob_upload_failed" as const;
  cause?: unknown;

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

  try {
    const res = await uploadPublicObject(pathname, buf, {
      contentType: "image/png",
      multipart: true,
    });
    return { url: res.url, bytes: buf.byteLength, pathname: res.pathname };
  } catch (e) {
    throw new BlobUploadError("storage upload failed", e);
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

  const out = await uploadPublicObject(pathname, webp, {
    contentType: "image/webp",
    multipart: false,
  });
  return out.url;
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

export async function resizeBufferToWebPPreview(
  input: Buffer,
  maxDimension = 640,
  quality = 75
): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();
}

export async function uploadWebPBuffer(
  input: Buffer,
  pathname: string
): Promise<string> {
  const out = await uploadPublicObject(pathname, input, {
    contentType: "image/webp",
    multipart: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return out.url;
}

export async function resizeRemoteImageToWebPPreviewUrl(
  sourceUrl: string,
  pathname: string,
  maxDimension = 640,
  quality = 75
): Promise<string> {
  const res = await fetch(sourceUrl, {
    headers: { Accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new BlobUploadError(`preview source fetch failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new BlobUploadError(`preview source is not image: ${contentType}`);
  }
  const input = Buffer.from(await res.arrayBuffer());
  const preview = await resizeBufferToWebPPreview(input, maxDimension, quality);
  return uploadWebPBuffer(preview, pathname);
}

/**
 * Extract a thumbnail frame from a video file (or video URL) and upload as WebP.
 * Uses ffmpeg to seek to 10% of duration (or 1s for short videos) and extract a frame.
 * Returns the public URL of the uploaded WebP thumbnail, or null on failure.
 */
export async function extractVideoThumbnail(
  sourceUrl: string,
  pathname: string
): Promise<string | null> {
  try {
    // Fetch video metadata first to get duration
    const metadata = await getVideoMetadata(sourceUrl);
    if (!metadata || !metadata.duration) {
      console.warn("[blob] video metadata unavailable, skipping thumbnail");
      return null;
    }

    // Seek to 10% of duration, minimum 1 second, maximum 10 seconds
    const seekTime = Math.min(Math.max(metadata.duration * 0.1, 1), 10);

    const frameBuffer = await extractVideoFrame(sourceUrl, seekTime);
    if (!frameBuffer) {
      return null;
    }

    // Resize frame to WebP thumbnail (320x180 for 16:9)
    const webpBuffer = await sharp(frameBuffer)
      .resize(320, 180, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    return uploadWebPBuffer(webpBuffer, pathname);
  } catch (e) {
    console.warn("[blob] video thumbnail extraction failed:", e);
    return null;
  }
}

interface VideoMetadata {
  duration: number;
  width?: number;
  height?: number;
}

async function getVideoMetadata(sourceUrl: string): Promise<VideoMetadata | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(sourceUrl, (err: Error | null, metadata: ffmpeg.FfprobeData) => {
      if (err || !metadata.format.duration) {
        resolve(null);
        return;
      }
      const videoStream = metadata.streams.find((s: ffmpeg.FfprobeStream) => s.codec_type === "video");
      resolve({
        duration: metadata.format.duration,
        width: videoStream?.width,
        height: videoStream?.height,
      });
    });
  });
}

async function extractVideoFrame(sourceUrl: string, seekTime: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const command = ffmpeg(sourceUrl)
      .seekInput(seekTime)
      .frames(1)
      .format("image2")
      .outputOptions(["-vcodec mjpeg", "-q:v 2"]);

    const chunks: Buffer[] = [];
    const stream = command.pipe();

    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer.length > 0 ? buffer : null);
    });

    stream.on("error", (err: Error) => {
      console.warn("[blob] ffmpeg frame extraction error:", err);
      resolve(null);
    });

    command.on("error", (err: Error) => {
      console.warn("[blob] ffmpeg command error:", err);
      resolve(null);
    });
  });
}