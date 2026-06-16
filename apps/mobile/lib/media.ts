// Mobile media helpers — lightweight port of web src/lib/youtube + canva.
// Pure sync predicates; no network. Embeds use react-native-webview in UI.

import type { CardAttachment } from "./types";

const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

export type MediaItem = {
  id: string;
  kind: "image" | "video" | "file" | "link";
  url: string;
  previewUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  order: number;
};

/** Extract an 11-char YouTube video id from watch / youtu.be / shorts URLs. */
export function extractYouTubeVideoId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!YT_HOSTS.has(u.hostname)) return null;

  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return YT_VIDEO_ID_RE.test(id) ? id : null;
  }

  for (const prefix of ["/shorts/", "/embed/", "/live/"]) {
    if (u.pathname.startsWith(prefix)) {
      const id = u.pathname.slice(prefix.length).split("/")[0];
      return YT_VIDEO_ID_RE.test(id) ? id : null;
    }
  }

  if (u.pathname === "/watch") {
    const id = u.searchParams.get("v") ?? "";
    return YT_VIDEO_ID_RE.test(id) ? id : null;
  }

  return null;
}

export function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}

export function isYouTubeVideoUrl(raw: string): boolean {
  return extractYouTubeVideoId(raw) !== null;
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** True for public canva.com / canva.link design URLs. */
export function isCanvaDesignUrl(raw: string): boolean {
  if (!raw) return false;
  let host: string;
  let pathname: string;
  try {
    const u = new URL(raw);
    host = u.hostname.toLowerCase();
    pathname = u.pathname;
  } catch {
    return false;
  }
  const canonicalHost =
    host === "canva.com" || host === "www.canva.com" || host === "canva.link";
  if (!canonicalHost) return false;
  if (host === "canva.link") return true;
  return /\/design\/[A-Za-z0-9_-]+/.test(pathname);
}

/** Extract design id from www.canva.com design URL (not canva.link). */
export function extractCanvaDesignId(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host !== "canva.com" && host !== "www.canva.com") return null;
    const m = u.pathname.match(/\/design\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the Canva embed URL from a design share URL.
 * Preserves share tokens so public "anyone with link" designs stay viewable.
 */
export function buildCanvaEmbedUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host !== "canva.com" && host !== "www.canva.com") return null;
    const m = u.pathname.match(
      /\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/(?:view|watch|edit)/
    );
    if (!m) return null;
    const [, designId, shareToken] = m;
    const pathPrefix = shareToken
      ? `/design/${designId}/${shareToken}/view`
      : `/design/${designId}/view`;
    return `https://www.canva.com${pathPrefix}?embed&meta`;
  } catch {
    return null;
  }
}

/** True if the URL looks like a directly playable video file. */
export function isDirectVideoUrl(raw: string): boolean {
  if (!raw) return false;
  let pathname: string;
  try {
    pathname = new URL(raw).pathname.toLowerCase();
  } catch {
    const q = raw.indexOf("?");
    pathname = (q >= 0 ? raw.slice(0, q) : raw).toLowerCase();
  }
  return /\.(mp4|webm|mov|mkv|ogv|m3u8)(?:[#?]|$)/.test(pathname);
}

export type EmbedKind = "youtube" | "canva" | "video" | null;

/** Decide how a URL should be embedded, if at all. */
export function classifyMediaUrl(raw: string): {
  kind: EmbedKind;
  embedUrl: string | null;
  externalUrl: string;
} {
  const youtubeId = extractYouTubeVideoId(raw);
  if (youtubeId) {
    return {
      kind: "youtube",
      embedUrl: buildYouTubeEmbedUrl(youtubeId),
      externalUrl: raw,
    };
  }
  const canvaUrl = buildCanvaEmbedUrl(raw);
  if (canvaUrl) {
    return { kind: "canva", embedUrl: canvaUrl, externalUrl: raw };
  }
  if (isDirectVideoUrl(raw)) {
    return { kind: "video", embedUrl: raw, externalUrl: raw };
  }
  return { kind: null, embedUrl: null, externalUrl: raw };
}

/** Build a normalized media + file list from legacy fields + attachments. */
export function buildMediaItems({
  attachments,
  imageUrl,
  thumbUrl,
  videoUrl,
  linkUrl,
  linkTitle,
  linkDesc,
  linkImage,
  fileUrl,
  fileName,
  fileSize,
  fileMimeType,
}: {
  attachments?: CardAttachment[];
  imageUrl?: string | null;
  thumbUrl?: string | null;
  videoUrl?: string | null;
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDesc?: string | null;
  linkImage?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
}): MediaItem[] {
  const items: MediaItem[] = [...(attachments ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      url: a.url,
      previewUrl: null,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      order: a.order,
    }));

  let nextOrder =
    items.length > 0 ? Math.max(...items.map((a) => a.order)) + 1 : 0;
  const has = (kind: MediaItem["kind"], url?: string | null) =>
    Boolean(url && items.some((a) => a.kind === kind && a.url === url));

  if (imageUrl && !has("image", imageUrl)) {
    items.unshift({
      id: `legacy-image-${imageUrl}`,
      kind: "image",
      url: imageUrl,
      previewUrl: thumbUrl ?? null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      order: -1,
    });
  }
  if (videoUrl && !has("video", videoUrl)) {
    items.push({
      id: `legacy-video-${videoUrl}`,
      kind: "video",
      url: videoUrl,
      previewUrl: null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      order: nextOrder++,
    });
  }
  if (linkUrl && !has("link", linkUrl)) {
    items.push({
      id: `legacy-link-${linkUrl}`,
      kind: "link",
      url: linkUrl,
      previewUrl: linkImage ?? null,
      fileName: linkTitle ?? null,
      fileSize: null,
      mimeType: linkDesc ?? null,
      order: nextOrder++,
    });
  }
  if (fileUrl && !has("file", fileUrl)) {
    items.push({
      id: `legacy-file-${fileUrl}`,
      kind: "file",
      url: fileUrl,
      previewUrl: null,
      fileName: fileName ?? null,
      fileSize: fileSize ?? null,
      mimeType: fileMimeType ?? null,
      order: nextOrder++,
    });
  }

  return items.sort((a, b) => a.order - b.order);
}

export function fileAttachments(items: MediaItem[]): MediaItem[] {
  return items.filter((a) => a.kind === "file");
}

export function mediaAttachments(items: MediaItem[]): MediaItem[] {
  return items.filter((a) => a.kind !== "file");
}

export function safeHost(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
