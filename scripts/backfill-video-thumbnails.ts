import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export type BackfillArgs = {
  write: boolean;
  dryRun: boolean;
  force: boolean;
  loadEnvFiles: boolean;
  limit: number;
  concurrency: number;
  downloadTimeoutMs: number;
  ffmpegTimeoutMs: number;
  maxSourceBytes: number;
  maxFfmpegStdoutBytes: number;
};

const DEFAULT_ARGS: BackfillArgs = {
  write: false,
  dryRun: true,
  force: false,
  loadEnvFiles: false,
  limit: 500,
  concurrency: 1,
  downloadTimeoutMs: 300_000,
  ffmpegTimeoutMs: 120_000,
  maxSourceBytes: 1_073_741_824,
  maxFfmpegStdoutBytes: 67_108_864,
};

const BOOLEAN_ARGS = new Map([
  ["--force", "force"],
  ["--load-env-files", "loadEnvFiles"],
] as const);

const VALUE_ARGS = new Map([
  ["--limit", "limit"],
  ["--concurrency", "concurrency"],
  ["--download-timeout-ms", "downloadTimeoutMs"],
  ["--ffmpeg-timeout-ms", "ffmpegTimeoutMs"],
  ["--max-source-bytes", "maxSourceBytes"],
  ["--max-ffmpeg-stdout-bytes", "maxFfmpegStdoutBytes"],
] as const);

export function parseArgs(argv: readonly string[]): BackfillArgs {
  const parsed = { ...DEFAULT_ARGS };
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const rawArg = argv[index];
    const equalsIndex = rawArg.indexOf("=");
    const name = equalsIndex === -1 ? rawArg : rawArg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : rawArg.slice(equalsIndex + 1);

    if (name === "--dry-run" || name === "--write") {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value`);
      if (seen.has(name)) throw new Error(`duplicate argument: ${name}`);
      seen.add(name);
      continue;
    }

    if (BOOLEAN_ARGS.has(name as never)) {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value`);
      if (seen.has(name)) throw new Error(`duplicate argument: ${name}`);
      seen.add(name);
      parsed[BOOLEAN_ARGS.get(name as never)!] = true;
      continue;
    }

    if (VALUE_ARGS.has(name as never)) {
      if (seen.has(name)) throw new Error(`duplicate argument: ${name}`);
      seen.add(name);
      const value = inlineValue ?? argv[++index];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for ${name}`);
      }
      if (!/^\d+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) {
        throw new Error(`invalid value for ${name}: ${value}`);
      }
      parsed[VALUE_ARGS.get(name as never)!] = Number(value);
      continue;
    }

    throw new Error(`unknown argument: ${rawArg}`);
  }

  if (seen.has("--dry-run") && seen.has("--write")) {
    throw new Error("--dry-run and --write are mutually exclusive");
  }
  parsed.write = seen.has("--write");
  parsed.dryRun = !parsed.write;
  if (parsed.concurrency > 2) throw new Error("--concurrency must be at most 2");
  return parsed;
}

export type WriteEnv = {
  supabaseOrigin: string;
  bucket: string;
  legacyOrigins: readonly string[];
};

/**
 * Validates every environment value required for write mode. Errors never
 * include the offending value, only the variable name.
 */
export function validateWriteEnv(env: NodeJS.ProcessEnv): WriteEnv {
  if (!env.DATABASE_URL || env.DATABASE_URL.trim() === "") {
    throw new Error("DATABASE_URL is required for --write");
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY.trim() === "") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for --write");
  }

  const rawSupabaseUrl = env.SUPABASE_URL?.trim();
  if (!rawSupabaseUrl) throw new Error("SUPABASE_URL is required for --write");
  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(rawSupabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL is not a valid absolute URL");
  }
  if (supabaseUrl.protocol !== "https:") throw new Error("SUPABASE_URL must use https");
  if (supabaseUrl.username !== "" || supabaseUrl.password !== "") {
    throw new Error("SUPABASE_URL must not contain credentials");
  }
  if (supabaseUrl.search !== "" || supabaseUrl.hash !== "") {
    throw new Error("SUPABASE_URL must not contain a query or hash");
  }
  if (supabaseUrl.pathname !== "/") throw new Error("SUPABASE_URL must not contain a path");

  const supabaseBucket = env.SUPABASE_STORAGE_BUCKET?.trim();
  const auraBucket = env.AURA_STORAGE_BUCKET?.trim();
  if (supabaseBucket && auraBucket && supabaseBucket !== auraBucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET and AURA_STORAGE_BUCKET disagree");
  }
  const bucket = supabaseBucket ?? auraBucket;
  if (!bucket) {
    throw new Error(
      "SUPABASE_STORAGE_BUCKET or AURA_STORAGE_BUCKET must be set explicitly for --write",
    );
  }

  return {
    supabaseOrigin: supabaseUrl.origin,
    bucket,
    legacyOrigins: parseLegacyOrigins(env.AURA_LEGACY_VIDEO_SOURCE_ORIGINS),
  };
}

function parseLegacyOrigins(rawValue: string | undefined): readonly string[] {
  const entries = (rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return entries.map((entry) => {
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error("AURA_LEGACY_VIDEO_SOURCE_ORIGINS contains an invalid origin");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.pathname !== "/"
    ) {
      throw new Error(
        "AURA_LEGACY_VIDEO_SOURCE_ORIGINS entries must be bare https origins",
      );
    }
    return parsed.origin;
  });
}

export type VideoSourcePolicy = WriteEnv;

export type CreatedPreview = {
  url: string;
  cleanup?: () => Promise<void>;
};

/**
 * Only the exact Supabase public object prefix or an explicitly allowlisted
 * legacy origin may be fetched. No wildcard or suffix matching.
 */
export function assertAllowedVideoSource(sourceUrl: string, policy: VideoSourcePolicy): URL {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("video source must be an absolute https URL");
  }
  if (parsed.protocol !== "https:") throw new Error("video source must use https");
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("video source must not contain credentials");
  }
  if (parsed.hash !== "") throw new Error("video source must not contain a hash");

  if (parsed.origin === policy.supabaseOrigin) {
    if (parsed.search !== "") {
      throw new Error("Supabase video source must not contain a query");
    }
    if (!parsed.pathname.startsWith(`/storage/v1/object/public/${policy.bucket}/`)) {
      throw new Error("video source is outside the configured Supabase bucket");
    }
    return parsed;
  }

  if (policy.legacyOrigins.includes(parsed.origin)) return parsed;
  throw new Error("video source origin is not allowlisted");
}

export async function processWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  processItem: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer");
  }
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await processItem(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

type Attachment = {
  id: string;
  cardId: string;
  url: string;
};

type BackfillDb = {
  cardAttachment: {
    findMany(options: object): Promise<Attachment[]>;
    update(options: object): Promise<unknown>;
  };
  $disconnect(): Promise<void>;
};

export type CreatePreview = (
  attachment: Attachment,
  args: BackfillArgs,
  policy: VideoSourcePolicy,
) => Promise<CreatedPreview | null>;

const defaultCreatePreview: CreatePreview = (attachment, args, policy) =>
  extractVideoThumbnail(
    attachment.url,
    `uploads/previews/videos/${attachment.id}-${Date.now()}-${randomBytes(3).toString("hex")}.webp`,
    args,
    process.env.AURA_FFMPEG_PATH ?? "ffmpeg",
    policy,
  );

export async function runBackfill(
  args: BackfillArgs,
  db: BackfillDb,
  policy: VideoSourcePolicy | null,
  createPreview: CreatePreview = defaultCreatePreview,
): Promise<void> {
  if (args.write && !policy) {
    throw new Error("video source policy is required for --write");
  }
  const attachments = await db.cardAttachment.findMany({
    where: {
      kind: "video",
      ...(args.force ? {} : { OR: [{ previewUrl: null }, { previewUrl: "" }] }),
    },
    select: { id: true, cardId: true, url: true, fileName: true, previewUrl: true },
    take: args.limit,
    orderBy: { createdAt: "desc" },
  });

  let updated = 0;
  let failed = 0;
  await processWithConcurrency(attachments, args.concurrency, async (attachment) => {
    try {
      const createdPreview =
        args.write && policy ? await createPreview(attachment, args, policy) : null;
      if (args.write && !createdPreview) {
        failed += 1;
        return;
      }
      if (args.write) {
        try {
          await db.cardAttachment.update({
            where: { id: attachment.id },
            data: { previewUrl: createdPreview!.url },
          });
        } catch (updateError) {
          if (createdPreview?.cleanup) {
            try {
              await createdPreview.cleanup();
            } catch {
              console.warn(
                `[backfill-video-thumbnails] orphan cleanup failed attachment=${attachment.id} card=${attachment.cardId}`,
              );
            }
          }
          throw updateError;
        }
      }
      updated += 1;
      console.log(
        `[backfill-video-thumbnails] ${args.write ? "updated" : "would update"} attachment=${attachment.id} card=${attachment.cardId}`,
      );
    } catch (error) {
      failed += 1;
      console.warn(
        `[backfill-video-thumbnails] failed attachment=${attachment.id} card=${attachment.cardId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  console.log(
    JSON.stringify(
      { write: args.write, dryRun: args.dryRun, force: args.force, scanned: attachments.length, updated, failed },
      null,
      2,
    ),
  );
  if (failed > 0) {
    throw new Error(`video thumbnail backfill completed with ${failed} failed item(s)`);
  }
}

async function extractVideoThumbnail(
  sourceUrl: string,
  pathname: string,
  args: BackfillArgs,
  ffmpegPath: string,
  policy: VideoSourcePolicy,
): Promise<CreatedPreview | null> {
  const localSource = await materializeVideoSource(sourceUrl, {
    timeoutMs: args.downloadTimeoutMs,
    maxBytes: args.maxSourceBytes,
    policy,
  });
  try {
    const frameBuffer =
      (await extractVideoFrame(localSource, 1, ffmpegPath, args)) ??
      (await extractVideoFrame(localSource, 0, ffmpegPath, args));
    if (!frameBuffer) return null;

    const { default: sharp } = await import("sharp");
    const webpBuffer = await sharp(frameBuffer)
      .resize(320, 180, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const { deletePublicObjects, uploadPublicObject } = await import(
      "../src/lib/media-storage"
    );
    const result = await uploadPublicObject(pathname, webpBuffer, {
      contentType: "image/webp",
      multipart: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return {
      url: result.url,
      cleanup: async () => {
        const cleanup = await deletePublicObjects([result.url]);
        if (cleanup.deleted !== 1) {
          throw new Error("uploaded preview cleanup did not delete the object");
        }
      },
    };
  } catch (error) {
    console.warn(
      "[backfill-video-thumbnails] thumbnail extraction failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    await unlink(localSource).catch(() => undefined);
  }
}

type MaterializeOptions = {
  timeoutMs: number;
  maxBytes: number;
  policy: VideoSourcePolicy;
  fetchImpl?: typeof fetch;
  tempPath?: string;
};

export async function materializeVideoSource(
  sourceUrl: string,
  options: MaterializeOptions,
): Promise<string> {
  const allowedUrl = assertAllowedVideoSource(sourceUrl, options.policy);

  const tempPath =
    options.tempPath ??
    path.join(
      tmpdir(),
      `aura-video-${process.pid}-${Date.now()}-${randomBytes(8).toString("hex")}.mp4`,
    );
  try {
    const response = await (options.fetchImpl ?? fetch)(allowedUrl.href, {
      headers: { Accept: "video/*,application/octet-stream" },
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`video download was redirected: HTTP ${response.status}`);
    }
    if (!response.ok) throw new Error(`video download failed: HTTP ${response.status}`);

    const contentLength = response.headers.get("content-length");
    if (contentLength !== null) {
      const declaredBytes = Number(contentLength);
      if (Number.isFinite(declaredBytes) && declaredBytes > options.maxBytes) {
        throw new Error(`video source exceeds ${options.maxBytes} bytes`);
      }
    }
    if (!response.body) throw new Error("video download returned no body");

    const file = await open(tempPath, "wx");
    try {
      const reader = response.body.getReader();
      let receivedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > options.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`video source exceeds ${options.maxBytes} bytes`);
        }
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await file.write(
            value,
            offset,
            value.byteLength - offset,
          );
          if (bytesWritten < 1) throw new Error("video download write made no progress");
          offset += bytesWritten;
        }
      }
    } finally {
      await file.close();
    }
    return tempPath;
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function validateFfmpeg(ffmpegPath: string, timeoutMs: number): Promise<void> {
  const valid = await runFfmpeg({
    executable: ffmpegPath,
    args: ["-version"],
    timeoutMs,
    captureOutput: false,
  });
  if (!valid) throw new Error(`FFmpeg executable is unavailable or invalid: ${ffmpegPath}`);
}

async function extractVideoFrame(
  sourcePath: string,
  seekTime: number,
  ffmpegPath: string,
  args: BackfillArgs,
): Promise<Buffer | null> {
  return runFfmpeg({
    executable: ffmpegPath,
    args: buildFfmpegFrameArgs(sourcePath, seekTime),
    timeoutMs: args.ffmpegTimeoutMs,
    captureOutput: true,
    maxStdoutBytes: args.maxFfmpegStdoutBytes,
  });
}

export function buildFfmpegFrameArgs(
  sourcePath: string,
  seekTime: number,
): readonly string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(seekTime),
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-q:v",
    "2",
    "pipe:1",
  ];
}

export type FfmpegChild = {
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown };
  stderr: { resume(): unknown };
  on(event: string, listener: (...eventArgs: never[]) => void): unknown;
  kill(signal: "SIGKILL"): unknown;
};

export type FfmpegSpawnOptions = {
  env: NodeJS.ProcessEnv;
};

export type FfmpegSpawn = (
  executable: string,
  args: readonly string[],
  options: FfmpegSpawnOptions,
) => FfmpegChild;

type RunFfmpegOptions = {
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  maxStdoutBytes?: number;
  spawnImpl?: FfmpegSpawn;
};

export function runFfmpeg(
  options: RunFfmpegOptions & { captureOutput: true },
): Promise<Buffer | null>;
export function runFfmpeg(
  options: RunFfmpegOptions & { captureOutput: false },
): Promise<boolean>;
export function runFfmpeg(
  options: RunFfmpegOptions & { captureOutput: boolean },
): Promise<Buffer | null | boolean> {
  const captureOutput = options.captureOutput;
  const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_ARGS.maxFfmpegStdoutBytes;
  return new Promise((resolve) => {
    const spawnImpl: FfmpegSpawn =
      options.spawnImpl ??
      ((executable, args, spawnOptions) =>
        spawn(executable, [...args], {
          stdio: ["ignore", "pipe", "pipe"],
          env: spawnOptions.env,
        }) as unknown as FfmpegChild);
    const child = spawnImpl(options.executable, options.args, {
      env: buildFfmpegChildEnv(process.env),
    });
    const chunks: Buffer[] = [];
    let capturedBytes = 0;
    let settled = false;
    const finish = (result: Buffer | null | boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(captureOutput ? null : false);
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      capturedBytes += chunk.byteLength;
      if (capturedBytes > maxStdoutBytes) {
        child.kill("SIGKILL");
        console.warn(
          `[backfill-video-thumbnails] FFmpeg output exceeded ${maxStdoutBytes} bytes`,
        );
        finish(captureOutput ? null : false);
        return;
      }
      if (captureOutput) chunks.push(chunk);
    });
    child.stderr.resume();
    child.on("error", () => finish(captureOutput ? null : false));
    child.on("close", (code: number | null) => {
      if (!captureOutput) return finish(code === 0);
      const buffer = Buffer.concat(chunks);
      finish(code === 0 && buffer.length > 0 ? buffer : null);
    });
  });
}

export function buildFfmpegChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const childEnv: Partial<NodeJS.ProcessEnv> = {};
  for (const key of ["PATH", "LANG", "LC_ALL", "TZ"]) {
    if (env[key]) childEnv[key] = env[key];
  }
  return childEnv as NodeJS.ProcessEnv;
}

function loadEnvFile(filename: string) {
  const filePath = path.join(process.cwd(), filename);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.loadEnvFiles) {
    loadEnvFile(".env");
    loadEnvFile(".env.local");
  }
  const policy = args.write ? validateWriteEnv(process.env) : null;
  if (args.write) {
    await validateFfmpeg(process.env.AURA_FFMPEG_PATH ?? "ffmpeg", args.ffmpegTimeoutMs);
  }
  const { db } = await import("../src/lib/db");
  try {
    await runBackfill(args, db as unknown as BackfillDb, policy);
  } finally {
    await db.$disconnect();
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
