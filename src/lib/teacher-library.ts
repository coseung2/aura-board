import "server-only";

import { createHash, randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import sharp from "sharp";

import { db } from "@/lib/db";
import { resolveCanvaDesignId } from "@/lib/canva";
import { extractCanvaDesignId } from "@/lib/canva-url";
import {
  deletePublicObjects,
  parseSupabasePublicObjectUrl,
  uploadPublicObject,
} from "@/lib/media-storage";
import type {
  TeacherLibraryItemDto,
  TeacherLibraryPayload,
} from "@/lib/teacher-library-types";

const MAX_EXTERNAL_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const SUPPORTED_IMAGE_MIME = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

type LibraryItemRow = {
  id: string;
  collectionId: string | null;
  kind: string;
  title: string;
  assetUrl: string | null;
  previewUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  canvaDesignId: string | null;
  canvaViewUrl: string | null;
  pageCount: number | null;
  sourceBoardId: string | null;
  sourceSectionId: string | null;
  sourceCardId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ImageCandidate = {
  cardId: string;
  title: string;
  url: string;
  mimeType: string | null;
  fileSize: number | null;
};

export function serializeTeacherLibraryItem(
  row: LibraryItemRow,
): TeacherLibraryItemDto {
  return {
    ...row,
    kind: row.kind === "canva" ? "canva" : "image",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getTeacherLibrary(
  userId: string,
): Promise<TeacherLibraryPayload> {
  const [collections, items] = await Promise.all([
    db.teacherLibraryCollection.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { items: true } } },
    }),
    db.teacherLibraryItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      itemCount: collection._count.items,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    })),
    items: items.map(serializeTeacherLibraryItem),
  };
}

export async function importSectionIntoTeacherLibrary(args: {
  userId: string;
  sectionId: string;
}) {
  const section = await db.section.findUnique({
    where: { id: args.sectionId },
    select: {
      id: true,
      title: true,
      boardId: true,
      cards: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          imageUrl: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          fileMimeType: true,
          linkUrl: true,
          linkImage: true,
          canvaDesignId: true,
          attachments: {
            orderBy: { order: "asc" },
            select: {
              kind: true,
              url: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
            },
          },
        },
      },
    },
  });
  if (!section) throw new TeacherLibraryError("section_not_found", 404);

  const collectionName = normalizeCollectionName(section.title);
  const collection = await db.teacherLibraryCollection.upsert({
    where: { userId_name: { userId: args.userId, name: collectionName } },
    create: { userId: args.userId, name: collectionName },
    update: { updatedAt: new Date() },
  });

  let created = 0;
  let reused = 0;
  const failures: Array<{ cardId: string; reason: string }> = [];

  for (const card of section.cards) {
    const designId =
      card.canvaDesignId?.trim() ||
      (card.linkUrl ? extractCanvaDesignId(card.linkUrl) : null) ||
      (card.linkUrl ? await resolveCanvaDesignId(card.linkUrl).catch(() => null) : null);
    if (designId) {
      const sourceKey = `canva:${designId}`;
      const existing = await db.teacherLibraryItem.findUnique({
        where: { userId_sourceKey: { userId: args.userId, sourceKey } },
      });
      await db.teacherLibraryItem.upsert({
        where: { userId_sourceKey: { userId: args.userId, sourceKey } },
        create: {
          userId: args.userId,
          collectionId: collection.id,
          kind: "canva",
          title: normalizeItemTitle(card.title, "Canva 디자인"),
          sourceKey,
          previewUrl: card.linkImage,
          canvaDesignId: designId,
          canvaViewUrl: card.linkUrl,
          sourceBoardId: section.boardId,
          sourceSectionId: section.id,
          sourceCardId: card.id,
        },
        update: {
          collectionId: collection.id,
          title: normalizeItemTitle(card.title, "Canva 디자인"),
          previewUrl: card.linkImage,
          canvaViewUrl: card.linkUrl,
          sourceBoardId: section.boardId,
          sourceSectionId: section.id,
          sourceCardId: card.id,
        },
      });
      if (existing) reused += 1;
      else created += 1;
    }

    const imageCandidates = collectImageCandidates(card);
    for (const candidate of imageCandidates) {
      const sourceKey = `image:${hash(candidate.url)}`;
      const existing = await db.teacherLibraryItem.findUnique({
        where: { userId_sourceKey: { userId: args.userId, sourceKey } },
      });
      if (existing) {
        await db.teacherLibraryItem.update({
          where: { id: existing.id },
          data: {
            collectionId: collection.id,
            sourceBoardId: section.boardId,
            sourceSectionId: section.id,
            sourceCardId: candidate.cardId,
          },
        });
        reused += 1;
        continue;
      }

      let uploadedUrl: string | null = null;
      try {
        const stored = await materializeImage(args.userId, candidate);
        uploadedUrl = stored.uploaded ? stored.url : null;
        await db.teacherLibraryItem.create({
          data: {
            userId: args.userId,
            collectionId: collection.id,
            kind: "image",
            title: normalizeItemTitle(candidate.title, "이미지"),
            sourceKey,
            assetUrl: stored.url,
            previewUrl: stored.url,
            mimeType: stored.mimeType,
            fileSize: stored.fileSize,
            sourceBoardId: section.boardId,
            sourceSectionId: section.id,
            sourceCardId: candidate.cardId,
          },
        });
        created += 1;
      } catch (error) {
        if (uploadedUrl) {
          await deletePublicObjects([uploadedUrl]).catch(() => undefined);
        }
        failures.push({
          cardId: candidate.cardId,
          reason: error instanceof Error ? error.message : "image_import_failed",
        });
      }
    }
  }

  return {
    collection: { id: collection.id, name: collection.name },
    created,
    reused,
    failed: failures.length,
    failures,
  };
}

function collectImageCandidates(card: {
  id: string;
  title: string;
  imageUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  attachments: Array<{
    kind: string;
    url: string;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
  }>;
}): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  if (card.imageUrl) {
    candidates.push({
      cardId: card.id,
      title: card.title,
      url: card.imageUrl,
      mimeType: card.fileMimeType,
      fileSize: card.fileSize,
    });
  }
  if (
    card.fileUrl &&
    isImageMimeType(card.fileMimeType) &&
    !candidates.some((item) => item.url === card.fileUrl)
  ) {
    candidates.push({
      cardId: card.id,
      title: card.fileName || card.title,
      url: card.fileUrl,
      mimeType: card.fileMimeType,
      fileSize: card.fileSize,
    });
  }
  for (const attachment of card.attachments) {
    if (
      !attachment.url ||
      (attachment.kind !== "image" && !isImageMimeType(attachment.mimeType)) ||
      candidates.some((item) => item.url === attachment.url)
    ) {
      continue;
    }
    candidates.push({
      cardId: card.id,
      title: attachment.fileName || card.title,
      url: attachment.url,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    });
  }
  return candidates;
}

function isImageMimeType(value: string | null): boolean {
  return value?.split(";", 1)[0]?.trim().toLowerCase().startsWith("image/") ?? false;
}

async function materializeImage(
  userId: string,
  candidate: ImageCandidate,
): Promise<{ url: string; mimeType: string | null; fileSize: number | null; uploaded: boolean }> {
  if (parseSupabasePublicObjectUrl(candidate.url) || candidate.url.startsWith("/uploads/")) {
    return {
      url: candidate.url,
      mimeType: candidate.mimeType,
      fileSize: candidate.fileSize,
      uploaded: false,
    };
  }

  const response = await fetchSafeImage(candidate.url);
  const mimeType = normalizeMimeType(response.headers.get("content-type"));
  const extension = mimeType ? SUPPORTED_IMAGE_MIME.get(mimeType) : null;
  if (!mimeType || !extension) throw new Error("unsupported_image_type");
  const body = await readLimitedBody(response, MAX_EXTERNAL_IMAGE_BYTES);
  await sharp(body).metadata();
  const pathname = `teacher-library/${userId}/${randomUUID()}.${extension}`;
  const stored = await uploadPublicObject(pathname, body, {
    contentType: mimeType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return { url: stored.url, mimeType, fileSize: body.byteLength, uploaded: true };
}

async function fetchSafeImage(rawUrl: string): Promise<Response> {
  let current = new URL(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHttpUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
      signal: AbortSignal.timeout(12_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("too_many_redirects");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`image_download_failed_${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_EXTERNAL_IMAGE_BYTES) throw new Error("image_too_large");
    return response;
  }
  throw new Error("image_download_failed");
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("unsupported_image_url");
  }
  if (url.username || url.password) throw new Error("unsafe_image_url");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("unsafe_image_url");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("unsafe_image_url");
  }
}
function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const value = mapped ?? normalized;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function readLimitedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error("image_body_missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error("image_too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function normalizeMimeType(value: string | null): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || null;
}

function normalizeCollectionName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 80);
  return normalized || "이름 없는 컬럼";
}

function normalizeItemTitle(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160) || fallback;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class TeacherLibraryError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "TeacherLibraryError";
  }
}
