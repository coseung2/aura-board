import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";

export class MediaStorageError extends Error {
  code = "media_storage_failed" as const;
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MediaStorageError";
    this.cause = cause;
  }
}

export type MediaStorageProvider = "supabase" | "vercel-blob" | "filesystem";

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

function getSupabaseStorageConfig(): { url: string; serviceRoleKey: string; bucket: string } | null {
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

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    try {
      const out = await put(normalizedPath, body, {
        access: "public",
        contentType: options.contentType,
        token: blobToken,
        multipart: options.multipart ?? true,
        addRandomSuffix: false,
        ...(typeof options.cacheControlMaxAge === "number"
          ? { cacheControlMaxAge: options.cacheControlMaxAge }
          : {}),
        ...(options.contentDisposition ? { contentDisposition: options.contentDisposition } : {}),
      });
      return { url: out.url, pathname: normalizedPath, provider: "vercel-blob" };
    } catch (e) {
      console.warn("[media-storage] Vercel Blob put() failed, falling back to fs", e);
    }
  }

  return uploadToFilesystem(normalizedPath, body);
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
