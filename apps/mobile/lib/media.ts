// Mobile media helpers — lightweight port of web src/lib/youtube + canva.
// Pure sync predicates; no network. Embeds use react-native-webview in UI.

import type { CardAttachment } from "./types";

export const MOBILE_EMBED_ORIGIN = "https://aura-board.com";

/** Internal WebView base paths are not playable media or public web pages. */
export function isMobileEmbedUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const target = new URL(raw.trim());
    const wrapper = new URL(MOBILE_EMBED_ORIGIN);
    return (
      target.origin === wrapper.origin &&
      target.pathname.startsWith("/mobile-embed/")
    );
  } catch {
    return false;
  }
}

const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);
const CANVA_DESIGN_HOSTS = new Set(["canva.com", "www.canva.com"]);
const CANVA_SHORT_HOSTS = new Set(["canva.link", "www.canva.link"]);

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
  if (!YT_HOSTS.has(u.hostname.toLowerCase())) return null;

  if (u.hostname.toLowerCase() === "youtu.be") {
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

/**
 * Build a WebView-safe YouTube embed URL.
 *
 * `enablejsapi` lets the wrapper page receive player errors, while `origin`
 * and `widget_referrer` identify the native app's trusted web origin. Without
 * that identity Android WebView requests can be rejected by YouTube with
 * player error 153.
 */
export function buildYouTubeEmbedUrl(
  videoId: string,
  origin = MOBILE_EMBED_ORIGIN,
): string {
  const embed = new URL(
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
  );
  embed.searchParams.set("enablejsapi", "1");
  embed.searchParams.set("playsinline", "1");
  embed.searchParams.set("rel", "0");
  embed.searchParams.set("origin", origin);
  embed.searchParams.set("widget_referrer", origin);
  return embed.toString();
}

export function isYouTubeVideoUrl(raw: string): boolean {
  return extractYouTubeVideoId(raw) !== null;
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** Deterministic YouTube thumbnail from any URL, or null if not a YouTube link. */
export function getYouTubeThumbnailUrlFromLink(
  raw: string | null | undefined,
): string | null {
  const videoId = extractYouTubeVideoId(raw ?? "");
  return videoId ? getYouTubeThumbnailUrl(videoId) : null;
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
  if (CANVA_SHORT_HOSTS.has(host)) return true;
  return (
    CANVA_DESIGN_HOSTS.has(host) && /\/design\/[A-Za-z0-9_-]+/.test(pathname)
  );
}

/** Extract design id from www.canva.com design URL (not canva.link). */
export function extractCanvaDesignId(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!CANVA_DESIGN_HOSTS.has(host)) return null;
    const m = u.pathname.match(/\/design\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the Canva embed URL from a canonical design share URL.
 * Preserves share tokens so public "anyone with link" designs stay viewable.
 * Short canva.link URLs must be expanded by the server before they can embed.
 */
export function buildCanvaEmbedUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!CANVA_DESIGN_HOSTS.has(host)) return null;
    const m = u.pathname.match(
      /\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/(?:view|watch|edit|present|embed)/,
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

/**
 * Static HTML WebViews must accept every origin at the wrapper layer.
 * react-native-webview opens URLs rejected here in the system browser before
 * our navigation callback can inspect them. isAllowedEmbedNavigation remains
 * the actual allowlist for top-level navigation.
 */
export function embedOriginWhitelist(): string[] {
  return ["*"];
}

export function isAllowedEmbedNavigation(
  raw: string,
  kind: EmbedKind,
  embedUrl: string | null,
): boolean {
  if (raw === "about:blank") return true;
  try {
    const target = new URL(raw);
    const wrapper = new URL(MOBILE_EMBED_ORIGIN);
    if (
      target.origin === wrapper.origin &&
      target.pathname.startsWith("/mobile-embed/")
    ) {
      return true;
    }
    if (kind === "youtube") {
      return (
        (target.hostname === "youtube.com" ||
          target.hostname === "www.youtube.com") &&
        target.pathname.startsWith("/embed/")
      );
    }
    if (kind === "canva") {
      return (
        (target.hostname === "canva.com" ||
          target.hostname === "www.canva.com") &&
        target.pathname.startsWith("/design/")
      );
    }
    if (kind === "video" && embedUrl) {
      return target.origin === new URL(embedUrl).origin;
    }
  } catch {
    return false;
  }
  return false;
}

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
  // A canva.link short URL or a non-public Canva editor URL is still useful
  // as an external link, but loading it as the WebView's top-level document
  // causes redirect / X-Frame / login failures. Only canonical embed URLs are
  // considered embeddable here.
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
      previewUrl: a.previewUrl,
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
      previewUrl: linkImage ?? getYouTubeThumbnailUrlFromLink(linkUrl),
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

/** Resolve the first media URL that the shared mobile player can render. */
export function findPlayableMediaUrl(
  card: Parameters<typeof buildMediaItems>[0],
): string | null {
  const item = buildMediaItems(card).find(
    (candidate) =>
      (candidate.kind === "video" || candidate.kind === "link") &&
      classifyMediaUrl(candidate.url).kind !== null,
  );
  return item?.url ?? null;
}

export function fileAttachments(items: MediaItem[]): MediaItem[] {
  return items.filter((a) => a.kind === "file");
}

export function mediaAttachments(items: MediaItem[]): MediaItem[] {
  return items.filter((a) => a.kind !== "file");
}

/** Pick one display image for each logical media attachment. */
export function mediaPreviewUrls(items: MediaItem[]): string[] {
  const urls = items.flatMap((item) => {
    if (item.kind === "image") {
      return [item.previewUrl ?? item.url];
    }
    if (item.kind === "video" || item.kind === "link") {
      const preview = item.previewUrl ?? getYouTubeThumbnailUrlFromLink(item.url);
      return preview ? [preview] : [];
    }
    return [];
  });

  return [...new Set(urls)];
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
