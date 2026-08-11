import { z } from "zod";
import type { FeedMediaInput } from "./types";

const MAX_MEDIA_ITEMS = 10;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const feedPostInputSchema = z
  .object({
    title: nullableText(160),
    body: nullableText(10_000),
    media: z
      .array(
        z.object({
          kind: z.enum(["IMAGE", "YOUTUBE"]),
          url: z.string().trim().url().max(2_048),
          altText: nullableText(500),
        }),
      )
      .max(MAX_MEDIA_ITEMS)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.title && !value.body && value.media.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "게시물에는 제목, 본문 또는 미디어가 필요합니다.",
      });
    }
  });

export const teacherFeedPostInputSchema = feedPostInputSchema.and(
  z.object({ classroomId: z.string().trim().min(1) }),
);

export const adminFeedPostInputSchema = feedPostInputSchema.and(
  z.object({
    addToPool: z.boolean().default(true),
    publishGlobal: z.boolean().default(true),
  }),
);

export const publishPoolPostInputSchema = z.object({
  classroomIds: z.array(z.string().trim().min(1)).min(1).max(50),
});

export const feedListQuerySchema = z.object({
  scope: z.enum(["classroom", "global"]).default("classroom"),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FeedCursor = {
  publishedAt: Date;
  publicationId: string;
};

const cursorPayloadSchema = z.object({
  publishedAt: z.string().datetime(),
  publicationId: z.string().min(1),
});

export function encodeFeedCursor(cursor: FeedCursor) {
  return Buffer.from(
    JSON.stringify({
      publishedAt: cursor.publishedAt.toISOString(),
      publicationId: cursor.publicationId,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeFeedCursor(value: string | undefined): FeedCursor | null {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const payload = cursorPayloadSchema.parse(decoded);
    return {
      publishedAt: new Date(payload.publishedAt),
      publicationId: payload.publicationId,
    };
  } catch {
    return null;
  }
}

export function normalizeFeedMedia(
  media: z.infer<typeof feedPostInputSchema>["media"],
): FeedMediaInput[] {
  return media.map((item) => {
    const parsedUrl = parseHttpUrl(item.url);

    if (item.kind === "IMAGE") {
      return {
        kind: "IMAGE",
        url: parsedUrl.toString(),
        youtubeVideoId: null,
        altText: item.altText,
      };
    }

    const videoId = getYoutubeVideoId(parsedUrl);
    if (!videoId) {
      throw new Error("invalid_youtube_url");
    }

    return {
      kind: "YOUTUBE",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      youtubeVideoId: videoId,
      altText: item.altText,
    };
  });
}

function parseHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("invalid_media_url");
  }
  return url;
}

export function getYoutubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else {
    const [prefix, id] = url.pathname.split("/").filter(Boolean);
    if (["embed", "shorts", "live"].includes(prefix ?? "")) {
      candidate = id ?? null;
    }
  }

  return candidate && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
}
