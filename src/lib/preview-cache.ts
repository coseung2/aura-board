import "server-only";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

export function previewCacheKey(kind: string, url: string): string {
  return `${kind}:${createHash("sha256").update(url).digest("hex")}`;
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
  await db.previewFetchCache.upsert({
    where: { key: previewCacheKey(kind, url) },
    create: {
      key: previewCacheKey(kind, url),
      kind,
      url,
      status: ok ? "ok" : "miss",
      payload: ok ? payload ?? undefined : undefined,
      error: ok ? null : error ?? "miss",
      expiresAt: new Date(Date.now() + (ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS)),
    },
    update: {
      status: ok ? "ok" : "miss",
      payload: ok ? payload ?? undefined : undefined,
      error: ok ? null : error ?? "miss",
      expiresAt: new Date(Date.now() + (ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS)),
    },
  });
}
