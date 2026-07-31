import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const DEFAULT_BUCKET = "aura-board-uploads";

export type FieldSpec = {
  model: string;
  label: string;
  field: string;
};

export const FIELDS: readonly FieldSpec[] = [
  { model: "card", label: "Card", field: "imageUrl" },
  { model: "card", label: "Card", field: "thumbUrl" },
  { model: "card", label: "Card", field: "linkImage" },
  { model: "card", label: "Card", field: "videoUrl" },
  { model: "card", label: "Card", field: "fileUrl" },
  { model: "cardAttachment", label: "CardAttachment", field: "url" },
  { model: "cardAttachment", label: "CardAttachment", field: "previewUrl" },
  { model: "studentAsset", label: "StudentAsset", field: "fileUrl" },
  { model: "studentAsset", label: "StudentAsset", field: "thumbnailUrl" },
  { model: "submission", label: "Submission", field: "fileUrl" },
  { model: "submission", label: "Submission", field: "videoThumbnail" },
  { model: "board", label: "Board", field: "thumbnailUrl" },
  { model: "board", label: "Board", field: "eventPosterUrl" },
  { model: "vibeProject", label: "VibeProject", field: "thumbnailUrl" },
  { model: "plantObservationImage", label: "PlantObservationImage", field: "url" },
  { model: "plantObservationImage", label: "PlantObservationImage", field: "thumbnailUrl" },
  { model: "djPlayEvent", label: "DjPlayEvent", field: "linkImage" },
  { model: "user", label: "User", field: "image" },
  { model: "user", label: "User", field: "appBackgroundUrl" },
  { model: "dailyBannerSubmission", label: "DailyBannerSubmission", field: "imageUrl" },
  { model: "storeItem", label: "StoreItem", field: "imageUrl" },
  { model: "avatarItem", label: "AvatarItem", field: "imageUrl" },
  { model: "avatarItem", label: "AvatarItem", field: "thumbnailUrl" },
];

export type Args = {
  write: boolean;
  loadEnvFiles: boolean;
  limit: number;
};

export function parseArgs(args: readonly string[]): Args {
  let write = false;
  let loadEnvFiles = false;
  let limit = Number.POSITIVE_INFINITY;
  let hasLimit = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      write = true;
    } else if (arg === "--load-env-files") {
      loadEnvFiles = true;
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      if (hasLimit) throw new Error("--limit may only be specified once");
      hasLimit = true;
      const value = arg === "--limit" ? args[++index] : arg.slice("--limit=".length);
      if (value == null || value === "" || !/^\d+$/.test(value)) {
        throw new Error("--limit must be a positive integer");
      }
      limit = Number(value);
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error("--limit must be a positive safe integer");
      }
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { write, loadEnvFiles, limit };
}

type EnvFileAccess = {
  exists: (path: string) => boolean;
  read: (path: string) => string;
};

export function loadLocalEnvFiles(
  env: NodeJS.ProcessEnv = process.env,
  files: readonly string[] = [".env", ".env.local"],
  access: EnvFileAccess = {
    exists: existsSync,
    read: (path) => readFileSync(path, "utf8"),
  },
): void {
  for (const file of files) {
    if (!access.exists(file)) continue;
    for (const line of access.read(file).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (env[key] != null) continue;
      env[key] = stripEnvQuotes(rawValue.trim());
    }
  }
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function isVercelBlobUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(BLOB_HOST_SUFFIX) &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === ""
    );
  } catch {
    return false;
  }
}

export function objectPathFromBlobUrl(url: string): string {
  if (!isVercelBlobUrl(url)) throw new Error(`not a safe Vercel Blob URL: ${url}`);
  // Validate the raw path because URL normalizes literal and encoded dot
  // segments before exposing pathname.
  const rawPath = url.match(/^https:\/\/[^/?#]+([^?#]*)/i)?.[1] ?? "";
  const encodedSegments = rawPath.replace(/^\/+/, "").split("/");
  let segments: string[];
  try {
    segments = encodedSegments.map(decodeURIComponent);
  } catch {
    throw new Error(`invalid encoded object path from ${url}`);
  }
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\") ||
        /[\u0000-\u001f\u007f]/.test(segment),
    )
  ) {
    throw new Error(`unsafe object path from ${url}`);
  }
  return segments.join("/");
}

export function encodeObjectPath(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

type Delegate = {
  findMany: (query: unknown) => Promise<Array<Record<string, unknown> & { id: unknown }>>;
  update: (query: unknown) => Promise<unknown>;
};

type Database = Record<string, Delegate | unknown>;
type Logger = Pick<Console, "log" | "error">;

export type MigrationResult = {
  scanned: number;
  candidates: number;
  copied: number;
  failed: number;
  dryRun: boolean;
};

export async function runMigration(options: {
  args: Args;
  db: Database;
  copy: (sourceUrl: string, pathname: string) => Promise<string>;
  logger?: Logger;
}): Promise<MigrationResult> {
  const { args, db, copy, logger = console } = options;
  let scanned = 0;
  let candidates = 0;
  let copied = 0;
  let failed = 0;
  let processed = 0;

  if (!args.write) {
    logger.log("DRY RUN: no files copied and no DB rows updated. Re-run with --write to migrate.");
  }

  for (const spec of FIELDS) {
    const delegate = db[spec.model] as Delegate | undefined;
    if (!delegate) continue;
    const rows = await delegate.findMany({
      where: { [spec.field]: { contains: "public.blob.vercel-storage.com" } },
      select: { id: true, [spec.field]: true },
    });
    for (const row of rows) {
      scanned += 1;
      const value = row[spec.field];
      if (!isVercelBlobUrl(value)) continue;
      candidates += 1;
      if (processed >= args.limit) continue;
      const pathname = objectPathFromBlobUrl(value);
      processed += 1;
      if (!args.write) {
        logger.log(`[dry] ${spec.label}.${spec.field} ${String(row.id)}: ${value} -> ${pathname}`);
        continue;
      }
      try {
        const nextUrl = await copy(value, pathname);
        await delegate.update({ where: { id: row.id }, data: { [spec.field]: nextUrl } });
        copied += 1;
        logger.log(`[ok] ${spec.label}.${spec.field} ${String(row.id)}: ${nextUrl}`);
      } catch (error) {
        failed += 1;
        logger.error(
          `[fail] ${spec.label}.${spec.field} ${String(row.id)}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  const result = { scanned, candidates, copied, failed, dryRun: !args.write };
  logger.log(JSON.stringify(result, null, 2));
  if (args.write && failed > 0) {
    throw new Error(`migration completed with ${failed} failed item(s)`);
  }
  return result;
}

function getStorageConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET ?? env.AURA_STORAGE_BUCKET ?? DEFAULT_BUCKET;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, bucket };
}

async function copyToSupabase(sourceUrl: string, pathname: string): Promise<string> {
  const config = getStorageConfig();
  const sourceHeaders: HeadersInit = {};
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    sourceHeaders.authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
  }
  const source = await fetch(sourceUrl, { headers: sourceHeaders });
  if (!source.ok) {
    const hint = source.status === 403
      ? process.env.BLOB_READ_WRITE_TOKEN
        ? " (Vercel Blob denied the object read; check whether the Blob store is suspended or quota-blocked)"
        : " (set BLOB_READ_WRITE_TOKEN to read protected or quota-blocked Vercel Blob objects)"
      : "";
    throw new Error(`source fetch failed ${source.status} ${source.statusText}${hint}`);
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
    "content-type": source.headers.get("content-type") ?? "application/octet-stream",
    "cache-control": source.headers.get("cache-control") ?? "public, max-age=31536000, immutable",
    "x-upsert": "true",
  };
  const contentDisposition = source.headers.get("content-disposition");
  if (contentDisposition) headers["content-disposition"] = contentDisposition;
  const encodedPath = encodeObjectPath(pathname);
  const target = `${config.url}/storage/v1/object/${config.bucket}/${encodedPath}`;
  const uploaded = await fetch(target, {
    method: "POST",
    headers,
    body: Buffer.from(await source.arrayBuffer()) as unknown as BodyInit,
  });
  if (!uploaded.ok) {
    const detail = await uploaded.text().catch(() => "");
    throw new Error(`supabase upload failed ${uploaded.status}: ${detail.slice(0, 300)}`);
  }
  return `${config.url}/storage/v1/object/public/${config.bucket}/${encodedPath}`;
}

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.loadEnvFiles) loadLocalEnvFiles();

  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    if (args.write) {
      const config = getStorageConfig();
      console.log(`WRITE MODE: migrating to Supabase bucket ${config.bucket}`);
    }
    await runMigration({ args, db: db as unknown as Database, copy: copyToSupabase });
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
