import { NextResponse } from "next/server";
import { createHash } from "crypto";
import sharp from "sharp";
import {
  deriveCanvaThumbnailUrl,
  isCanvaDesignUrl,
  proxiedCanvaThumbnailUrl,
} from "@/lib/canva";
import { resolveCanvaEmbedUrlCached } from "@/lib/canva-preview-cache";
import { getPreviewCache, setPreviewCache } from "@/lib/preview-cache";
import { uploadPublicObject } from "@/lib/media-storage";
import {
  extractChannelHandle,
  extractVideoId,
  fetchYouTubeChannelMeta,
  fetchYouTubeMeta,
} from "@/lib/youtube";

type LinkPreviewPayload = {
  title: string | null;
  description: string | null;
  image: string | null;
};

const MAX_HTML_BYTES = 100 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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

function absolutizeUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return new URL(decodeHtmlEntities(value.trim()), baseUrl).toString();
  } catch {
    return null;
  }
}

function cacheHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function proxiedLinkPreviewImageUrl(
  imageUrl: string | null,
  pageUrl: string
): string | null {
  const absolute = absolutizeUrl(imageUrl, pageUrl);
  if (!absolute) return null;
  return `/api/link-preview/image?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(pageUrl)}`;
}

function hasStaleAuraBoardOgImage(payload: LinkPreviewPayload): boolean {
  return Boolean(
    payload.image?.includes("aura-teacher.com") &&
      payload.image.includes("aura-board-og.png")
  );
}

async function fetchOgImagePreview(
  imageUrl: string,
  pageUrl: string,
  fallbackUrl = proxiedLinkPreviewImageUrl(imageUrl, pageUrl)
): Promise<string | null> {
  const cacheKey = `${imageUrl}|${pageUrl}`;
  const cached = await getPreviewCache<{ url: string }>("link-preview-image", cacheKey);
  if (cached.hit) {
    return cached.status === "ok" ? cached.payload.url : fallbackUrl;
  }

  try {
    const upstream = await fetch(imageUrl, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: pageUrl,
      },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!upstream.ok) {
      await setPreviewCache("link-preview-image", cacheKey, null, false, `HTTP ${upstream.status}`);
      return fallbackUrl;
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      await setPreviewCache("link-preview-image", cacheKey, null, false, "not_image");
      return fallbackUrl;
    }

    const contentLength = Number(upstream.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      await setPreviewCache("link-preview-image", cacheKey, null, false, "image_too_large");
      return fallbackUrl;
    }

    const sourceBuffer = Buffer.from(await upstream.arrayBuffer());
    if (sourceBuffer.byteLength > MAX_IMAGE_BYTES) {
      await setPreviewCache("link-preview-image", cacheKey, null, false, "image_too_large");
      return fallbackUrl;
    }

    const preview = await sharp(sourceBuffer)
      .rotate()
      .resize(640, 360, {
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toBuffer();

    const pathname = `link-previews/${cacheHash(imageUrl)}.webp`;
    const stored = await uploadPublicObject(pathname, preview, {
      contentType: "image/webp",
      multipart: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });

    const payload = { url: stored.url };
    await setPreviewCache("link-preview-image", cacheKey, payload, true);
    return stored.url;
  } catch (e) {
    await setPreviewCache(
      "link-preview-image",
      cacheKey,
      null,
      false,
      e instanceof Error ? e.message : "image_fetch_failed"
    ).catch(() => undefined);
    return fallbackUrl;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const youtubeVideoId = extractVideoId(url);
    if (youtubeVideoId) {
      const videoCached = await getPreviewCache<LinkPreviewPayload>(
        "link-preview-youtube-video",
        url
      );
      if (videoCached.hit && videoCached.status === "ok") {
        return NextResponse.json(videoCached.payload);
      }

      const meta = await fetchYouTubeMeta(youtubeVideoId);
      if (meta) {
        const payload = {
          title: meta.title,
          description: meta.authorName ? `YouTube · ${meta.authorName}` : "YouTube",
          image: meta.thumbnailUrl,
        };
        await setPreviewCache("link-preview-youtube-video", url, payload, true);
        await setPreviewCache("link-preview", url, payload, true);
        return NextResponse.json(payload);
      }
    }

    const cached = await getPreviewCache<LinkPreviewPayload>("link-preview", url);
    if (
      cached.hit &&
      (cached.status !== "ok" ||
        (cached.payload.image && !hasStaleAuraBoardOgImage(cached.payload)))
    ) {
      return NextResponse.json(
        cached.status === "ok"
          ? cached.payload
          : { title: null, description: null, image: null }
      );
    }

    if (isCanvaDesignUrl(url)) {
      const embed = await resolveCanvaEmbedUrlCached(url);
      if (embed) {
        const image = await fetchOgImagePreview(
          embed.thumbnailUrl,
          url,
          proxiedCanvaThumbnailUrl(embed.thumbnailUrl, 640)
        );
        const payload = {
          title: embed.title,
          description: embed.authorName ? `by ${embed.authorName}` : null,
          image,
        };
        await setPreviewCache("link-preview", url, payload, true);
        return NextResponse.json(payload);
      }
      const derivedImage = deriveCanvaThumbnailUrl(url);
      if (derivedImage) {
        const payload = {
          title: "Canva design",
          description: null,
          image: derivedImage,
        };
        await setPreviewCache("link-preview", url, payload, true);
        return NextResponse.json(payload);
      }
    }

    // YouTube channel / @handle / custom / user URL.
    // extractVideoId() is short-circuited by extractChannelHandle() so a
    // genuine watch URL still falls through to the video oEmbed branch
    // inside /api/cards. Here we treat the channel page as a generic
    // metadata scrape: og:title / og:image / og:description.
    if (extractChannelHandle(url)) {
      // Cache the raw channel-meta fetch separately so the "no description"
      // outcome (genuine negative cache) doesn't poison the image cache
      // for sites we later add to the same kind.
      const channelCached = await getPreviewCache<{
        title: string | null;
        description: string | null;
        image: string | null;
      }>("link-preview-youtube-channel", url);
      if (channelCached.hit) {
        if (channelCached.status === "ok") return NextResponse.json(channelCached.payload);
        const shouldRetryAfterEmptyGenericCache =
          cached.hit && cached.status === "ok" && !cached.payload.image;
        if (!shouldRetryAfterEmptyGenericCache) {
          return NextResponse.json({ title: null, description: null, image: null });
        }
        // A previous low-byte channel scrape may have warmed the generic
        // cache with an empty payload. Retry the YouTube-specific path so
        // URLs like /@jocoding recover immediately after parser fixes.
      }

      const meta = await fetchYouTubeChannelMeta(url);
      if (!meta) {
        await setPreviewCache(
          "link-preview-youtube-channel",
          url,
          null,
          false,
          "channel_fetch_failed"
        );
        // Fall through to the generic HTML scrape below. Most YouTube
        // channel pages do serve og: meta even when our stripped-down
        // helper can't pick it out, so this is a strictly-better UX than
        // returning empty.
      } else {
        // Channel banners are wide (2560x1440 / 1546x423 etc.) and DO NOT
        // survive the 640x360 sharp cover-fit that we use for OG images
        // (it would crop to a centre band and lose the avatar). Skip the
        // sharp pipeline and let the client load the original banner
        // through the proxy. We still cache the proxy URL (computed
        // lazily) so future reads short-circuit before any upstream call.
        const banner = meta.bannerUrl;
        const image = banner
          ? `/api/link-preview/image?url=${encodeURIComponent(
              banner
            )}&referer=${encodeURIComponent(meta.canonicalUrl)}`
          : null;
        const payload = {
          title: meta.title,
          description: meta.description,
          image,
        };
        await setPreviewCache("link-preview-youtube-channel", url, payload, true);
        // Also warm the generic cache so a follow-up call short-circuits.
        await setPreviewCache("link-preview", url, payload, true);
        return NextResponse.json(payload);
      }
    }

    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      await setPreviewCache("link-preview", url, null, false, `HTTP ${res.status}`);
      return NextResponse.json({ title: null, description: null, image: null });
    }

    // Only read first 100KB to avoid downloading huge pages
    const reader = res.body?.getReader();
    if (!reader) {
      await setPreviewCache("link-preview", url, null, false, "no_body");
      return NextResponse.json({ title: null, description: null, image: null });
    }

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

    function getMeta(property: string): string | null {
      const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m?.[1]) return decodeHtmlEntities(m[1].trim());
      }
      return null;
    }

    let title =
      getMeta("og:title") ??
      getMeta("twitter:title") ??
      (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
        ? decodeHtmlEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)![1].trim())
        : null) ??
      null;

    // Skip generic "Unsupported client" titles
    if (title && /unsupported/i.test(title)) {
      title = getMeta("og:site_name") ?? title;
    }

    const description =
      getMeta("og:description") ??
      getMeta("twitter:description") ??
      getMeta("description") ??
      null;

    const rawImage =
      getMeta("og:image") ??
      getMeta("twitter:image") ??
      getMeta("twitter:image:src") ??
      null;
    const absoluteImage = absolutizeUrl(rawImage, res.url || url);
    const image = absoluteImage ? await fetchOgImagePreview(absoluteImage, res.url || url) : null;

    const payload = { title, description, image };
    await setPreviewCache("link-preview", url, payload, true);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[GET /api/link-preview]", e);
    await setPreviewCache(
      "link-preview",
      url,
      null,
      false,
      e instanceof Error ? e.message : "fetch_failed"
    ).catch(() => undefined);
    return NextResponse.json({ title: null, description: null, image: null });
  }
}
