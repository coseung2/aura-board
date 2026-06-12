import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const DEFAULT_BUCKET = "aura-board-uploads";

type FieldSpec = {
  model: string;
  label: string;
  field: string;
  idField?: string;
};

const FIELDS: FieldSpec[] = [
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
  { model: "board", label: "Board", field: "eventPosterUrl" },
  { model: "vibeProject", label: "VibeProject", field: "thumbnailUrl" },
  { model: "plantObservationImage", label: "PlantObservationImage", field: "url" },
  { model: "plantObservationImage", label: "PlantObservationImage", field: "thumbnailUrl" },
  { model: "djPlayEvent", label: "DjPlayEvent", field: "linkImage" },
];

type Args = {
  write: boolean;
  limit: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Number.POSITIVE_INFINITY;
  return { write, limit: Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY };
}

function getStorageConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? process.env.AURA_STORAGE_BUCKET ?? DEFAULT_BUCKET;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, bucket };
}

function isVercelBlobUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    return new URL(value).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function objectPathFromBlobUrl(url: string): string {
  const parsed = new URL(url);
  const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!path || path.includes("..") || path.includes("\\")) {
    throw new Error(`unsafe object path from ${url}`);
  }
  return path;
}

function encodeObjectPath(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

async function copyToSupabase(sourceUrl: string, pathname: string): Promise<string> {
  const config = getStorageConfig();
  const source = await fetch(sourceUrl);
  if (!source.ok) {
    throw new Error(`source fetch failed ${source.status} ${source.statusText}`);
  }
  const contentType = source.headers.get("content-type") ?? "application/octet-stream";
  const cacheControl = source.headers.get("cache-control") ?? "public, max-age=31536000, immutable";
  const body = Buffer.from(await source.arrayBuffer());

  const target = `${config.url}/storage/v1/object/${config.bucket}/${encodeObjectPath(pathname)}`;
  const uploaded = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "content-type": contentType,
      "cache-control": cacheControl,
      "x-upsert": "true",
    },
    body: body as unknown as BodyInit,
  });
  if (!uploaded.ok) {
    const detail = await uploaded.text().catch(() => "");
    throw new Error(`supabase upload failed ${uploaded.status}: ${detail.slice(0, 300)}`);
  }
  return `${config.url}/storage/v1/object/public/${config.bucket}/${encodeObjectPath(pathname)}`;
}

async function main() {
  const args = parseArgs();
  let scanned = 0;
  let candidates = 0;
  let copied = 0;
  let failed = 0;
  let processed = 0;

  if (!args.write) {
    console.log("DRY RUN: no files copied and no DB rows updated. Re-run with --write to migrate.");
  } else {
    const config = getStorageConfig();
    console.log(`WRITE MODE: migrating to Supabase bucket ${config.bucket}`);
  }

  for (const spec of FIELDS) {
    const delegate = (db as any)[spec.model];
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
      if (!args.write) {
        console.log(`[dry] ${spec.label}.${spec.field} ${row.id}: ${value} -> ${pathname}`);
        processed += 1;
        continue;
      }
      try {
        const nextUrl = await copyToSupabase(value, pathname);
        await delegate.update({
          where: { id: row.id },
          data: { [spec.field]: nextUrl },
        });
        copied += 1;
        processed += 1;
        console.log(`[ok] ${spec.label}.${spec.field} ${row.id}: ${nextUrl}`);
      } catch (e) {
        failed += 1;
        console.error(`[fail] ${spec.label}.${spec.field} ${row.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  console.log(JSON.stringify({ scanned, candidates, copied, failed, dryRun: !args.write }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
