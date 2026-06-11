// YouTube URL validation + oEmbed fetch for DJ queue submissions.
//
// Accepted URL shapes (youtube.com + youtu.be only — SSRF guard):
//   - https://www.youtube.com/watch?v=<id>[&...]
//   - https://m.youtube.com/watch?v=<id>[&...]
//   - https://youtube.com/watch?v=<id>[&...]
//   - https://youtu.be/<id>[?t=...]
//   - https://www.youtube.com/shorts/<id>
//
// videoId regex: 11 chars, [A-Za-z0-9_-].
// Channel / handle URL shapes (no videoId):
//   - https://www.youtube.com/@<handle>            (1..30 chars, [A-Za-z0-9._-])
//   - https://www.youtube.com/channel/<UC...>       (24 chars, starts with UC)
//   - https://www.youtube.com/c/<custom>           (1..30 chars, [A-Za-z0-9._-])
//   - https://www.youtube.com/user/<legacy>        (1..30 chars, [A-Za-z0-9._-])

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HANDLE_RE = /^[A-Za-z0-9._-]{1,30}$/;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const CUSTOM_RE = /^[A-Za-z0-9._-]{1,30}$/;

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

export type YouTubeMeta = {
  videoId: string;
  canonicalUrl: string; // always https://www.youtube.com/watch?v=<id>
  title: string;
  thumbnailUrl: string;
  authorName: string;
};

// Channel/handle result. We capture the original path the user pasted
// (so canonicalUrl is stable and round-trips correctly on share) plus the
// resolved display handle / channel id when the URL carried one of the
// canonical forms.
export type YouTubeChannelHandle =
  | { kind: "handle"; handle: string; canonicalUrl: string }
  | { kind: "channel"; channelId: string; canonicalUrl: string }
  | { kind: "custom"; customName: string; canonicalUrl: string }
  | { kind: "user"; userName: string; canonicalUrl: string };

export type YouTubeChannelMeta = {
  canonicalUrl: string;
  title: string; // channel display name
  thumbnailUrl: string | null; // channel avatar (best effort)
  bannerUrl: string | null; // channel cover banner (best effort)
  description: string | null;
  authorName: string;
};

export function extractVideoId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;

  // youtu.be/<id>
  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  // /shorts/<id>, /embed/<id>, /live/<id>
  for (const prefix of ["/shorts/", "/embed/", "/live/"]) {
    if (u.pathname.startsWith(prefix)) {
      const id = u.pathname.slice(prefix.length).split("/")[0];
      return VIDEO_ID_RE.test(id) ? id : null;
    }
  }

  // /watch?v=<id>
  if (u.pathname === "/watch") {
    const id = u.searchParams.get("v") ?? "";
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  return null;
}

export function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Build a stable https://www.youtube.com/<path> canonical from a raw URL
// after the same SSRF guard extractVideoId uses. Strips query/fragment.
function safeYoutubeBase(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  // Strip tracking params and fragment.
  u.search = "";
  u.hash = "";
  return u;
}

// Recognises YouTube channel / handle / custom / user URLs that do NOT
// resolve to a single video. Returns the parsed handle plus the canonical
// https://www.youtube.com/... URL we should persist + share.
//
// Examples:
//   https://www.youtube.com/@jayychoii            → handle
//   https://www.youtube.com/@jayy.choii/featured   → handle (trailing path stripped)
//   https://www.youtube.com/channel/UCxxxx         → channel
//   https://www.youtube.com/c/CustomName          → custom
//   https://www.youtube.com/user/LegacyName       → user
export function extractChannelHandle(raw: string): YouTubeChannelHandle | null {
  // If it is a video URL we want nothing to do with it — the caller should
  // route it through extractVideoId() / fetchYouTubeMeta() instead.
  if (extractVideoId(raw)) return null;

  const u = safeYoutubeBase(raw);
  if (!u) return null;
  // Force the www. canonical host so stored URLs round-trip identically.
  u.hostname = "www.youtube.com";

  // /@handle
  if (u.pathname.startsWith("/@")) {
    const handle = u.pathname.slice(2).split("/")[0];
    if (HANDLE_RE.test(handle)) {
      // Drop any trailing path (e.g. /featured, /videos, /streams) — the
      // base channel URL is what we persist + share.
      u.pathname = `/@${handle}`;
      return { kind: "handle", handle, canonicalUrl: u.toString() };
    }
    return null;
  }

  // /channel/<UC...>
  if (u.pathname.startsWith("/channel/")) {
    const channelId = u.pathname.slice("/channel/".length).split("/")[0];
    if (CHANNEL_ID_RE.test(channelId)) {
      u.pathname = `/channel/${channelId}`;
      return { kind: "channel", channelId, canonicalUrl: u.toString() };
    }
    return null;
  }

  // /c/<custom>
  if (u.pathname.startsWith("/c/")) {
    const customName = u.pathname.slice(3).split("/")[0];
    if (CUSTOM_RE.test(customName)) {
      u.pathname = `/c/${customName}`;
      return { kind: "custom", customName, canonicalUrl: u.toString() };
    }
    return null;
  }

  // /user/<legacy>
  if (u.pathname.startsWith("/user/")) {
    const userName = u.pathname.slice("/user/".length).split("/")[0];
    if (CUSTOM_RE.test(userName)) {
      u.pathname = `/user/${userName}`;
      return { kind: "user", userName, canonicalUrl: u.toString() };
    }
    return null;
  }

  return null;
}

export function isYouTubeChannelUrl(raw: string | null | undefined): boolean {
  return Boolean(raw && extractChannelHandle(raw));
}

// oEmbed fetch. Returns null on any failure (private/deleted/network).
// Caller surfaces 400 with "재생할 수 없는 영상이에요" when null.
export async function fetchYouTubeMeta(
  videoId: string
): Promise<YouTubeMeta | null> {
  const target = canonicalUrl(videoId);
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;

  let res: Response;
  try {
    res = await fetch(oembedUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      // Next.js fetch cache — 24h is plenty for public oEmbed.
      next: { revalidate: 86400 },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let data: {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
  };
  try {
    data = await res.json();
  } catch {
    return null;
  }

  if (!data.title || !data.thumbnail_url) return null;

  return {
    videoId,
    canonicalUrl: target,
    title: data.title,
    thumbnailUrl: data.thumbnail_url,
    authorName: data.author_name ?? "",
  };
}

// Decode the small subset of HTML entities the YouTube page emits that
// appear inside <meta>/<title> strings. Mirrors the helper used by
// /api/link-preview so behaviour stays consistent across both paths.
function decodeHtmlEntitiesForChannel(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function readMetaFromChannelHtml(
  html: string,
  property: string
): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      "i"
    ),
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1]) return decodeHtmlEntitiesForChannel(m[1].trim());
  }
  return null;
}

// Channel page metadata fetch.
//
// YouTube does not expose a stable public oEmbed for /@handle or
// /channel/UC… URLs, and the Data API requires a server key we don't want
// to ship from the browser. We instead fetch the public channel page with
// a desktop Chrome User-Agent (YouTube serves a slimmed HTML+og bundle to
// those) and extract the og:title/og:image/og:description plus any
// banner image it exposes through link[rel=image_src] or og:image:alt.
//
// Returns null on any failure (404, private channel, rate limit, no
// title). Caller is expected to fall back to a plain URL-only link card.
export async function fetchYouTubeChannelMeta(
  raw: string
): Promise<YouTubeChannelMeta | null> {
  const handle = extractChannelHandle(raw);
  if (!handle) return null;

  let res: Response;
  // Two-step fetch with a short retry: Vercel serverless cold starts
  // routinely push a single fetch over the 10s upstream timeout (the
  // handler itself is warming up while the request races the deadline),
  // and YouTube occasionally drops a request on the first try. A single
  // transparent retry covers both without masking a real "page is down"
  // failure, which still surfaces as null on the second miss.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(handle.canonicalUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          // Desktop Chrome is the User-Agent YouTube's public HTML bundle is
          // tuned for; mobile UAs get a different shell that hides og:.
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        // 15s upstream budget: YouTube's HTML bundle is well under that
        // on a warm handler, but a cold start that also has to load
        // sharp/@vercel/blob can still need ~12s before the fetch is
        // even fired. Past 15s we give up and let the negative cache
        // absorb the failure (5 min TTL — see preview-cache.ts).
        signal: AbortSignal.timeout(15000),
        // Public pages tolerate 24h cache just like oEmbed.
        next: { revalidate: 86400 },
      });
      break;
    } catch (err) {
      if (attempt === 1) return null;
      // brief backoff before the retry so we don't slam YouTube on
      // transient network blips
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!res!) return null;

  // Hard cap to keep this endpoint from being abused as an open proxy.
  const MAX_HTML_BYTES = 200 * 1024;
  const reader = res.body?.getReader();
  if (!reader) return null;

  let html = "";
  const decoder = new TextDecoder();
  let totalBytes = 0;
  while (totalBytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
    totalBytes += value.length;
  }
  reader.cancel();

  // <title> is the most reliable channel name source when og:title strips
  // the " - YouTube" suffix.
  const rawTitle = readMetaFromChannelHtml(html, "og:title");
  const fallbackTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title =
    rawTitle ??
    (fallbackTitleMatch
      ? decodeHtmlEntitiesForChannel(fallbackTitleMatch[1].trim())
      : null);
  if (!title) return null;
  // YouTube appends " - YouTube" to <title> on every channel page.
  const cleanTitle = title.replace(/\s*-\s*YouTube\s*$/i, "").trim();

  const description =
    readMetaFromChannelHtml(html, "og:description") ??
    readMetaFromChannelHtml(html, "description");

  // og:image is the channel avatar; some channels only expose a banner via
  // <link rel="image_src"> which we fall back to.
  const ogImage = readMetaFromChannelHtml(html, "og:image");
  const linkImageMatch = html.match(
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
  );
  const banner =
    ogImage ??
    (linkImageMatch
      ? decodeHtmlEntitiesForChannel(linkImageMatch[1].trim())
      : null);

  // og:image and the link[rel=image_src] are not always split on YouTube's
  // page — many channels only ship one image. Without a separate field
  // marker we conservatively treat the only image as a banner and leave
  // thumbnailUrl null so the UI knows not to crop a square avatar from it.
  return {
    canonicalUrl: handle.canonicalUrl,
    title: cleanTitle,
    thumbnailUrl: null,
    bannerUrl: banner,
    description: description ? description.slice(0, 280) : null,
    authorName: cleanTitle,
  };
}
