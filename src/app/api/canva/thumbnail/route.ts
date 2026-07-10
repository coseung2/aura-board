import { NextResponse } from "next/server";
import {
  canvaGetDesign,
  extractCanvaDesignId,
  expandCanvaShortLink,
  getAccessToken,
  resolveCanvaEmbedUrl,
} from "@/lib/canva";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server-side proxy for Canva (and similar CDN) thumbnails. Clients
 * pass `url=<encoded>&w=<160|320|640>` and we stream back a right-sized
 * image without ever exposing the full-resolution original.
 *
 * Why this exists:
 *  - Canva rotates CDN hostnames occasionally. Rather than whitelist
 *    every shard in `next.config.ts`, this route gives us a stable
 *    same-origin URL that `next/image` can optimize further.
 *  - Explicitly rejects requests without `w` or with a `w` outside
 *    the allowed set — prevents anyone from asking for the original.
 */

const ALLOWED_WIDTHS = new Set(["160", "320", "640"]);
const ALLOWED_HOST_SUFFIXES = [
  ".canva.com",
  ".canva-web-files.com",
  "canva.com",
];
const MAX_HTML_BYTES = 512 * 1024;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const design = searchParams.get("design");
  let url = searchParams.get("url");
  const w = searchParams.get("w");
  let privateThumbnail = false;

  if (!url && !design) {
    return NextResponse.json({ error: "Missing url or design" }, { status: 400 });
  }
  if (!w || !ALLOWED_WIDTHS.has(w)) {
    return NextResponse.json(
      { error: "w must be one of 160|320|640 — originals are not served" },
      { status: 400 },
    );
  }

  if (!url && design) {
    url = await resolvePublicCanvaPageThumbnail(design);
    if (!url) {
      const embed = await resolveCanvaEmbedUrl(design);
      url = normalizeResolvedThumbnailUrl(embed?.thumbnailUrl);
    }
    if (!url) {
      const designId = extractCanvaDesignId(design);
      const user = await getCurrentUser().catch(() => null);
      const token = user ? await getAccessToken(user.id) : null;
      if (designId && token) {
        try {
          const info = await canvaGetDesign(token, designId);
          url = info.thumbnail?.url ?? null;
          privateThumbnail = Boolean(url);
        } catch {
          url = null;
        }
      }
    }
    if (!url) {
      // Expected "this design has no public thumbnail" outcome, not a
      // proxy failure — return 404 so the consumer renders its placeholder
      // and Vercel monitors do not page on an expected 5xx.
      return NextResponse.json(
        { error: "thumbnail_unavailable" },
        { status: 404 }
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url!);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only https is allowed" }, { status: 400 });
  }

  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === "canva.com" ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (!allowed) {
    return NextResponse.json({ error: "Host not allowlisted" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
        "User-Agent": "aura-board-thumbnail-proxy",
      },
      // Ensure we don't cache the upstream fetch at Next's fetch layer —
      // we rely on the response's own Cache-Control below.
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      const fallbackUrl = await resolveDesignThumbnailFromScreenUrl(parsed);
      const fallbackResponse = fallbackUrl
        ? await fetchThumbnailFallback(fallbackUrl.url, w, fallbackUrl.private)
        : null;
      if (fallbackResponse) return fallbackResponse;
      // Upstream 4xx (404/410/etc) is a normal "thumbnail is gone" outcome
      // for the consumer; only 5xx is a real proxy failure that we want to
      // keep visible in Vercel logs.
      if (upstream.status >= 500) {
        console.warn(
          `[GET /api/canva/thumbnail] upstream ${upstream.status} for ${parsed.hostname}${parsed.pathname}`,
        );
        return NextResponse.json(
          { error: `Upstream ${upstream.status}` },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: "thumbnail_unavailable" },
        { status: 404 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/webp";
    if (!contentType.startsWith("image/")) {
      const fallbackUrl = await resolveDesignThumbnailFromScreenUrl(parsed);
      const fallbackResponse = fallbackUrl
        ? await fetchThumbnailFallback(fallbackUrl.url, w, fallbackUrl.private)
        : null;
      if (fallbackResponse) return fallbackResponse;
      // 200 with a non-image body means the URL is alive but is not a
      // thumbnail (e.g. a login page or a redirect HTML). Treat as a
      // missing resource for the consumer.
      return NextResponse.json(
        { error: "thumbnail_unavailable" },
        { status: 404 },
      );
    }

    // We pass through the upstream bytes and tag the response with the
    // requested `w` so the CDN/browser can cache distinct variants.
    // Actual on-the-fly resizing is delegated to `next/image` when this
    // endpoint is consumed via the OptimizedImage wrapper (which hits
    // /_next/image with its own `w` query), so we don't need sharp here.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": privateThumbnail
          ? "private, no-store, max-age=0"
          : "public, max-age=86400, s-maxage=86400, immutable",
        Vary: privateThumbnail ? "Cookie, Authorization" : "Accept",
        "X-Thumbnail-Width": w,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    // Real proxy failure (network error, TLS, abort, etc). Keep the 5xx so
    // it shows up in Vercel alerts and we can investigate upstream.
    console.warn(
      `[GET /api/canva/thumbnail] fetch failed for ${parsed.toString()}`,
      e,
    );
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}

async function resolveDesignThumbnailFromScreenUrl(
  parsed: URL,
): Promise<{ url: string; private: boolean } | null> {
  const match = parsed.pathname.match(
    /\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/screen/
  );
  if (!match) return null;
  const [, designId, shareToken] = match;
  const designUrl = shareToken
    ? `https://www.canva.com/design/${designId}/${shareToken}/view`
    : `https://www.canva.com/design/${designId}/view`;
  const publicThumbnail = await resolvePublicCanvaPageThumbnail(designUrl);
  if (publicThumbnail) return { url: publicThumbnail, private: false };

  const embed = await resolveCanvaEmbedUrl(designUrl);
  const embedThumbnail = normalizeResolvedThumbnailUrl(embed?.thumbnailUrl);
  if (embedThumbnail) return { url: embedThumbnail, private: false };

  const user = await getCurrentUser().catch(() => null);
  const token = user ? await getAccessToken(user.id) : null;
  if (!token) return null;
  try {
    const info = await canvaGetDesign(token, designId);
    return info.thumbnail?.url
      ? { url: info.thumbnail.url, private: true }
      : null;
  } catch {
    return null;
  }
}

function normalizeResolvedThumbnailUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith("canva.com") && parsed.pathname.endsWith("/screen")) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchThumbnailFallback(
  url: string,
  width: string,
  privateThumbnail = false,
): Promise<Response | null> {
  const fallback = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
      "User-Agent": "aura-board-thumbnail-proxy",
    },
    cache: "no-store",
  });
  if (!fallback.ok || !fallback.body) return null;

  const fallbackType = fallback.headers.get("content-type") ?? "image/webp";
  if (!fallbackType.startsWith("image/")) return null;

  return new Response(fallback.body, {
    status: 200,
    headers: {
      "Content-Type": fallbackType,
      "Cache-Control": privateThumbnail
        ? "private, no-store, max-age=0"
        : "public, max-age=86400, s-maxage=86400, immutable",
      Vary: privateThumbnail ? "Cookie, Authorization" : "Accept",
      "X-Thumbnail-Width": width,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function resolvePublicCanvaPageThumbnail(rawDesignUrl: string): Promise<string | null> {
  const expandedUrl = await expandCanvaShortLink(rawDesignUrl);
  let pageUrl: URL;
  try {
    pageUrl = new URL(expandedUrl);
  } catch {
    return null;
  }

  const host = pageUrl.hostname.toLowerCase();
  if (host !== "canva.com" && host !== "www.canva.com") return null;
  if (!/\/design\/[A-Za-z0-9_-]+/.test(pageUrl.pathname)) return null;

  try {
    const res = await fetch(pageUrl.toString(), {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let totalBytes = 0;
    while (totalBytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value.length;
    }
    await reader.cancel().catch(() => undefined);

    const candidates = [
      ...readCanvaThumbnailUrls(html),
      readMetaContent(html, "og:image"),
      readMetaContent(html, "twitter:image"),
      readMetaContent(html, "twitter:image:src"),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      const absolute = new URL(
        decodeHtmlEntities(candidate),
        res.url || pageUrl.toString(),
      );
      const imageHost = absolute.hostname.toLowerCase();
      const allowed =
        imageHost === "canva.com" ||
        ALLOWED_HOST_SUFFIXES.some((suffix) => imageHost.endsWith(suffix));
      const isScreenUrl =
        imageHost.endsWith("canva.com") && absolute.pathname.endsWith("/screen");
      if (allowed && absolute.protocol === "https:" && !isScreenUrl) {
        return absolute.toString();
      }
    }

    return null;
  } catch {
    return null;
  }
}

function readCanvaThumbnailUrls(html: string): string[] {
  const normalizedHtml = decodeHtmlEntities(html)
    .replace(/\\+u0026/gi, "&")
    .replace(/\\+u003d/gi, "=")
    .replace(/\\+u002f/gi, "/")
    .replace(/\\+\//g, "/");
  const firstPageUrls = new Set<string>();
  const documentImagePattern =
    /https:\/\/media\.canva\.com\/v2\/document-image\/[^"'\\\s<>]+/gi;
  for (const match of normalizedHtml.matchAll(documentImagePattern)) {
    try {
      const candidate = new URL(match[0]);
      if (
        candidate.hostname.toLowerCase() === "media.canva.com" &&
        candidate.pathname.startsWith("/v2/document-image/") &&
        candidate.searchParams.get("page") === "1"
      ) {
        firstPageUrls.add(candidate.toString());
      }
    } catch {
      // Ignore malformed embedded values and continue to legacy candidates.
    }
  }

  const legacyUrls = new Set<string>();
  const legacyPattern =
    /https:\/\/document-export\.canva\.com\/[^"'\\\s<>]+?\/thumbnail\/[^"'\\\s<>]+?\.(?:png|jpe?g|webp)(?:\?[^"'\\\s<>]*)?/gi;
  for (const match of normalizedHtml.matchAll(legacyPattern)) {
    legacyUrls.add(match[0]);
  }
  return [...firstPageUrls, ...legacyUrls];
}

function readMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
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
