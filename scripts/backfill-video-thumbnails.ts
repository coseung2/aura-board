import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { uploadPublicObject } from "../src/lib/media-storage";

loadEnvFile(".env");
loadEnvFile(".env.local");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;

  const attachments = await db.cardAttachment.findMany({
    where: {
      kind: "video",
      ...(force ? {} : { OR: [{ previewUrl: null }, { previewUrl: "" }] }),
    },
    select: { id: true, cardId: true, url: true, fileName: true, previewUrl: true },
    take: Number.isFinite(limit) ? limit : 100,
    orderBy: { createdAt: "desc" },
  });

  let updated = 0;
  let failed = 0;

  for (const attachment of attachments) {
    try {
      const previewUrl = dryRun
        ? "dry-run"
        : await extractVideoThumbnail(
            attachment.url,
            `uploads/previews/videos/${attachment.id}-${Date.now()}-${randomBytes(3).toString("hex")}.webp`,
          );

      if (!previewUrl) {
        failed += 1;
        continue;
      }

      if (!dryRun) {
        await db.cardAttachment.update({
          where: { id: attachment.id },
          data: { previewUrl },
        });
      }
      updated += 1;
      console.log(
        `[backfill-video-thumbnails] ${dryRun ? "would update" : "updated"} attachment=${attachment.id} card=${attachment.cardId}`,
      );
    } catch (e) {
      failed += 1;
      console.warn(
        `[backfill-video-thumbnails] failed attachment=${attachment.id} card=${attachment.cardId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        force,
        supabaseStorage: Boolean(
          process.env.SUPABASE_SERVICE_ROLE_KEY &&
            (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
        ),
        scanned: attachments.length,
        updated,
        failed,
      },
      null,
      2,
    ),
  );
}

async function extractVideoThumbnail(
  sourceUrl: string,
  pathname: string,
): Promise<string | null> {
  const localSource = await materializeVideoSource(sourceUrl);
  try {
    const frameBuffer =
      (await extractVideoFrame(localSource, 1)) ??
      (await extractVideoFrame(localSource, 0));
    if (!frameBuffer) return null;

    const webpBuffer = await sharp(frameBuffer)
      .resize(320, 180, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    return uploadWebPBuffer(webpBuffer, pathname);
  } catch (e) {
    console.warn(
      "[backfill-video-thumbnails] thumbnail extraction failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  } finally {
    if (localSource !== sourceUrl) {
      await unlink(localSource).catch(() => undefined);
    }
  }
}

async function materializeVideoSource(sourceUrl: string): Promise<string> {
  if (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://")) {
    if (sourceUrl.startsWith("/")) return path.join(process.cwd(), "public", sourceUrl);
    return sourceUrl;
  }

  const res = await fetch(sourceUrl, {
    headers: { Accept: "video/*,application/octet-stream" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`video download failed: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(
    tmpdir(),
    `aura-video-${Date.now()}-${randomBytes(4).toString("hex")}.mp4`,
  );
  await writeFile(tmpPath, buffer);
  return tmpPath;
}

async function uploadWebPBuffer(buffer: Buffer, pathname: string): Promise<string> {
  const res = await uploadPublicObject(pathname, buffer, {
    contentType: "image/webp",
    multipart: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return res.url;
}

async function extractVideoFrame(sourceUrl: string, seekTime: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    if (!ffmpegStatic) {
      resolve(null);
      return;
    }

    const child = spawn(ffmpegStatic, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(seekTime),
      "-i",
      sourceUrl,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-q:v",
      "2",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      errors.push(chunk);
    });

    child.on("close", () => {
      const buffer = Buffer.concat(chunks);
      resolve(buffer.length > 0 ? buffer : null);
    });

    child.on("error", () => resolve(null));
  });
}

function loadEnvFile(filename: string) {
  const filePath = path.join(process.cwd(), filename);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
