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

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

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
