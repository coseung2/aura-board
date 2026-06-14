import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

export class MediaStorageError extends Error {
  code = "media_storage_failed" as const;
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MediaStorageError";
    this.cause = cause;
  }
}

export type MediaStorageProvider = "supabase" | "filesystem";

export type UploadPublicObjectOptions = {
  contentType: string;
  contentDisposition?: string;
  cacheControlMaxAge?: number;
  multipart?: boolean;
};

export type UploadPublicObjectResult = {
  url: string;
  pathname: string;
  provider: MediaStorageProvider;
};

const DEFAULT_BUCKET = "aura-board-uploads";

export type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

export function getSupabaseStorageConfig(): SupabaseStorageConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? process.env.AURA_STORAGE_BUCKET ?? DEFAULT_BUCKET;

  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, bucket };
}

export function getPublicStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? process.env.AURA_STORAGE_BUCKET ?? DEFAULT_BUCKET;
}

export function isSupabaseStoragePublicUrl(url: URL): boolean {
  const config = getSupabaseStorageConfig();
  if (!config) {
    return /\/storage\/v1\/object\/public\//.test(url.pathname);
  }
  const base = new URL(config.url);
  return (
    url.hostname === base.hostname &&
    url.pathname.startsWith(`/storage/v1/object/public/${config.bucket}/`)
  );
}

export function buildSupabasePublicUrl(pathname: string): string | null {
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  return `${config.url}/storage/v1/object/public/${config.bucket}/${encodeObjectPath(pathname)}`;
}

export function parseSupabasePublicObjectUrl(
  value: string | null | undefined,
): { bucket: string; pathname: string } | null {
  if (!value) return null;
  const config = getSupabaseStorageConfig();
  if (!config) return null;
  try {
    const url = new URL(value);
    const base = new URL(config.url);
    if (url.hostname !== base.hostname) return null;

    const prefix = `/storage/v1/object/public/${config.bucket}/`;
    if (!url.pathname.startsWith(prefix)) return null;

    const encodedPath = url.pathname.slice(prefix.length);
    const pathname = encodedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return { bucket: config.bucket, pathname };
  } catch {
    return null;
  }
}

export async function uploadPublicObject(
  pathname: string,
  body: Buffer,
  options: UploadPublicObjectOptions,
): Promise<UploadPublicObjectResult> {
  const normalizedPath = normalizeObjectPath(pathname);
  const supabase = getSupabaseStorageConfig();
  if (supabase) {
    return uploadToSupabase(supabase, normalizedPath, body, options);
  }

  if (isProductionRuntime()) {
    throw new MediaStorageError(
      "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return uploadToFilesystem(normalizedPath, body);
}

export async function deletePublicObjects(
  urls: (string | null | undefined)[],
): Promise<{ deleted: number; skipped: number }> {
  const config = getSupabaseStorageConfig();
  if (!config) {
    return { deleted: 0, skipped: urls.filter(Boolean).length };
  }

  const paths = [
    ...new Set(
      urls
        .map((url) => parseSupabasePublicObjectUrl(url))
        .filter((parsed): parsed is { bucket: string; pathname: string } => Boolean(parsed))
        .map((parsed) => parsed.pathname),
    ),
  ];
  if (paths.length === 0) {
    return { deleted: 0, skipped: urls.filter(Boolean).length };
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.storage.from(config.bucket).remove(paths);
  if (error) {
    throw new MediaStorageError(`Supabase Storage delete failed: ${error.message}`, error);
  }
  return { deleted: paths.length, skipped: urls.filter(Boolean).length - paths.length };
}

async function uploadToSupabase(
  config: { url: string; serviceRoleKey: string; bucket: string },
  pathname: string,
  body: Buffer,
  options: UploadPublicObjectOptions,
): Promise<UploadPublicObjectResult> {
  const endpoint = `${config.url}/storage/v1/object/${config.bucket}/${encodeObjectPath(pathname)}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
    "content-type": options.contentType,
    "x-upsert": "false",
  };
  if (typeof options.cacheControlMaxAge === "number") {
    headers["cache-control"] = `public, max-age=${options.cacheControlMaxAge}, immutable`;
  }
  if (options.contentDisposition) {
    headers["content-disposition"] = options.contentDisposition;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: body as unknown as BodyInit,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new MediaStorageError(
      `Supabase Storage upload failed (${res.status}): ${detail.slice(0, 500)}`,
    );
  }

  return {
    url: `${config.url}/storage/v1/object/public/${config.bucket}/${encodeObjectPath(pathname)}`,
    pathname,
    provider: "supabase",
  };
}

async function uploadToFilesystem(pathname: string, body: Buffer): Promise<UploadPublicObjectResult> {
  const safe = `${randomBytes(4).toString("hex")}-${pathname.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const abs = path.join(process.cwd(), "public", "uploads", safe);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  return { url: `/uploads/${safe}`, pathname: safe, provider: "filesystem" };
}

function normalizeObjectPath(pathname: string): string {
  const clean = pathname.replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.includes("\\")) {
    throw new MediaStorageError("invalid storage pathname");
  }
  return clean;
}

function encodeObjectPath(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}
