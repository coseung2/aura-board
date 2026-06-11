import "server-only";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Default negative cache TTL — 24h matches the original behaviour so
// unreachable sites don't keep hammering upstream on every read.
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
// Per-kind overrides. Use sparingly — short negatives only exist to
// recover from cold-start failures / transient upstream blips, not to
// mask real "page genuinely has no metadata" outcomes.
const NEGATIVE_TTL_OVERRIDES_MS: Record<string, number> = {
  // Vercel cold starts routinely exceed the 10s upstream timeout on
  // first request, and a 24h "this URL has no metadata" cache would
  // strand any channel URL pasted during that window. 5min lets the
  // next user retry cheaply while still protecting upstream.
  "link-preview-youtube-channel": 5 * 60 * 1000,
};

export function previewCacheKey(kind: string, url: string): string {
  return `${kind}:${createHash("sha256").update(url).digest("hex")}`;
}

function negativeTtlMs(kind: string): number {
  return NEGATIVE_TTL_OVERRIDES_MS[kind] ?? NEGATIVE_TTL_MS;
}

export async function getPreviewCache<T>(
  kind: string,
  url: string
): Promise<{ hit: true; status: "ok"; payload: T } | { hit: true; status: "miss" } | { hit: false }> {
  const row = await db.previewFetchCache.findUnique({
    where: { key: previewCacheKey(kind, url) },
  });
  if (!row || row.expiresAt <= new Date()) return { hit: false };
  if (row.status === "ok") {
    return { hit: true, status: "ok", payload: row.payload as T };
  }
  return { hit: true, status: "miss" };
}

export async function setPreviewCache(
  kind: string,
  url: string,
  payload: Prisma.InputJsonValue | undefined | null,
  ok: boolean,
  error?: string
): Promise<void> {
  const ttl = ok ? POSITIVE_TTL_MS : negativeTtlMs(kind);
  await db.previewFetchCache.upsert({
    where: { key: previewCacheKey(kind, url) },
    create: {
      key: previewCacheKey(kind, url),
      kind,
      url,
      status: ok ? "ok" : "miss",
      payload: ok ? payload ?? undefined : undefined,
      error: ok ? null : error ?? "miss",
      expiresAt: new Date(Date.now() + ttl),
    },
    update: {
      status: ok ? "ok" : "miss",
      payload: ok ? payload ?? undefined : undefined,
      error: ok ? null : error ?? "miss",
      expiresAt: new Date(Date.now() + ttl),
    },
  });
}
