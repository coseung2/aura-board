import "server-only";
import { randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  isMediaDegradedModeEnabled,
  MEDIA_DEGRADED_MESSAGE,
  MEDIA_DEGRADED_MODE_CODE,
} from "./media-degraded";

export type MediaStorageErrorCode =
  | "media_storage_failed"
  | typeof MEDIA_DEGRADED_MODE_CODE;

export class MediaStorageError extends Error {
  code: MediaStorageErrorCode;
  cause?: unknown;

  constructor(
    message: string,
    cause?: unknown,
    code: MediaStorageErrorCode = "media_storage_failed",
  ) {
    super(message);
    this.name = "MediaStorageError";
    this.cause = cause;
    this.code = code;
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

export type PrivateMediaObjectOptions = {
  contentType: string;
};

export type PrivateMediaObjectResult = {
  pathname: string;
  provider: MediaStorageProvider;
};

export type DownloadPrivateObjectResult = {
  body: Buffer;
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
  const bucket = configuredPublicBucket();

  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey, bucket };
}

export function getPublicStorageBucket(): string {
  return configuredPublicBucket();
}

function configuredPublicBucket(): string {
  return (
    process.env.SUPABASE_STORAGE_BUCKET?.trim() ||
    process.env.AURA_STORAGE_BUCKET?.trim() ||
    DEFAULT_BUCKET
  );
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
  assertMediaStorageAvailable();
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
  assertMediaStorageAvailable();
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

/**
 * Store an object that must never be reachable through a public storage URL.
 * Song-guess callers pass only derived clips and retain this opaque pathname
 * in the database; retrieval is always mediated by an authenticated route.
 */
export async function uploadPrivateObject(
  pathname: string,
  body: Buffer,
  options: PrivateMediaObjectOptions,
): Promise<PrivateMediaObjectResult> {
  assertMediaStorageAvailable();
  const normalizedPath = normalizePrivateObjectPath(pathname);
  const publicConfig = getSupabaseStorageConfig();
  const privateBucket = getPrivateStorageBucket();
  if (publicConfig && privateBucket === publicConfig.bucket) {
    throw new MediaStorageError("Private song-guess storage must use a dedicated bucket");
  }
  if (publicConfig && privateBucket) {
    await uploadToSupabasePrivate(
      { ...publicConfig, bucket: privateBucket },
      normalizedPath,
      body,
      options,
    );
    return { pathname: normalizedPath, provider: "supabase" };
  }

  if (isProductionRuntime()) {
    throw new MediaStorageError(
      "Private song-guess storage is not configured. Set SONG_GUESS_STORAGE_BUCKET with Supabase service credentials.",
    );
  }
  await uploadToPrivateFilesystem(normalizedPath, body);
  return { pathname: normalizedPath, provider: "filesystem" };
}

export async function downloadPrivateObject(
  pathname: string,
): Promise<DownloadPrivateObjectResult> {
  assertMediaStorageAvailable();
  const normalizedPath = normalizePrivateObjectPath(pathname);
  const publicConfig = getSupabaseStorageConfig();
  const privateBucket = getPrivateStorageBucket();
  if (publicConfig && privateBucket === publicConfig.bucket) {
    throw new MediaStorageError("Private song-guess storage must use a dedicated bucket");
  }
  if (publicConfig && privateBucket) {
    const endpoint = `${publicConfig.url}/storage/v1/object/${privateBucket}/${encodeObjectPath(normalizedPath)}`;
    const response = await fetch(endpoint, {
      headers: {
        authorization: `Bearer ${publicConfig.serviceRoleKey}`,
        apikey: publicConfig.serviceRoleKey,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new MediaStorageError(`Private storage download failed (${response.status})`);
    }
    return { body: Buffer.from(await response.arrayBuffer()), provider: "supabase" };
  }

  if (isProductionRuntime()) {
    throw new MediaStorageError("Private song-guess storage is not configured.");
  }
  try {
    const body = await readFile(privateFilesystemPath(normalizedPath));
    return { body, provider: "filesystem" };
  } catch (error) {
    throw new MediaStorageError("Private song-guess object was not found", error);
  }
}

export async function deletePrivateObject(pathname: string): Promise<void> {
  assertMediaStorageAvailable();
  const normalizedPath = normalizePrivateObjectPath(pathname);
  const publicConfig = getSupabaseStorageConfig();
  const privateBucket = getPrivateStorageBucket();
  if (publicConfig && privateBucket === publicConfig.bucket) {
    throw new MediaStorageError("Private song-guess storage must use a dedicated bucket");
  }
  if (publicConfig && privateBucket) {
    const endpoint = `${publicConfig.url}/storage/v1/object/${privateBucket}/${encodeObjectPath(normalizedPath)}`;
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${publicConfig.serviceRoleKey}`,
        apikey: publicConfig.serviceRoleKey,
      },
    });
    if (!response.ok && response.status !== 404) {
      throw new MediaStorageError(`Private storage delete failed (${response.status})`);
    }
    return;
  }
  if (isProductionRuntime()) return;
  try {
    await unlink(privateFilesystemPath(normalizedPath));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code !== "ENOENT") throw new MediaStorageError("Private object delete failed", error);
  }
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

async function uploadToSupabasePrivate(
  config: { url: string; serviceRoleKey: string; bucket: string },
  pathname: string,
  body: Buffer,
  options: PrivateMediaObjectOptions,
): Promise<void> {
  const endpoint = `${config.url}/storage/v1/object/${config.bucket}/${encodeObjectPath(pathname)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "content-type": options.contentType,
      "cache-control": "private, no-store",
      "x-upsert": "false",
    },
    body: body as unknown as BodyInit,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new MediaStorageError(
      `Private storage upload failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }
}

async function uploadToFilesystem(pathname: string, body: Buffer): Promise<UploadPublicObjectResult> {
  const safe = `${randomBytes(4).toString("hex")}-${pathname.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const abs = path.join(process.cwd(), "public", "uploads", safe);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  return { url: `/uploads/${safe}`, pathname: safe, provider: "filesystem" };
}

async function uploadToPrivateFilesystem(pathname: string, body: Buffer): Promise<void> {
  const target = privateFilesystemPath(pathname);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body, { flag: "wx" });
}

function privateFilesystemPath(pathname: string): string {
  return path.join(process.cwd(), ".song-guess-private", ...pathname.split("/"));
}

function getPrivateStorageBucket(): string | null {
  return (
    process.env.SONG_GUESS_STORAGE_BUCKET?.trim() ||
    process.env.AURA_SONG_GUESS_BUCKET?.trim() ||
    null
  );
}

function assertMediaStorageAvailable(): void {
  if (isMediaDegradedModeEnabled()) {
    throw new MediaStorageError(
      MEDIA_DEGRADED_MESSAGE,
      undefined,
      MEDIA_DEGRADED_MODE_CODE,
    );
  }
}

function normalizeObjectPath(pathname: string): string {
  const clean = pathname.replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.includes("\\")) {
    throw new MediaStorageError("invalid storage pathname");
  }
  return clean;
}

function normalizePrivateObjectPath(pathname: string): string {
  const normalized = normalizeObjectPath(pathname);
  if (!normalized.startsWith("song-guess/")) {
    throw new MediaStorageError("invalid private storage pathname");
  }
  return normalized;
}

function encodeObjectPath(pathname: string): string {
  return pathname.split("/").map(encodeURIComponent).join("/");
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}
