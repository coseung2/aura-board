import { NextResponse } from "next/server";
import {
  deriveCanvaThumbnailUrl,
  isCanvaDesignUrl,
  proxiedCanvaThumbnailUrl,
  resolveCanvaEmbedUrl,
} from "@/lib/canva";

function absolutizeUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function proxiedLinkPreviewImageUrl(
  imageUrl: string | null,
  pageUrl: string
): string | null {
  const absolute = absolutizeUrl(imageUrl, pageUrl);
  if (!absolute) return null;
  return `/api/link-preview/image?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(pageUrl)}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    if (isCanvaDesignUrl(url)) {
      const embed = await resolveCanvaEmbedUrl(url);
      if (embed) {
        return NextResponse.json({
          title: embed.title,
          description: embed.authorName ? `by ${embed.authorName}` : null,
          image: proxiedCanvaThumbnailUrl(embed.thumbnailUrl, 640),
        });
      }
      const derivedImage = deriveCanvaThumbnailUrl(url);
      if (derivedImage) {
        return NextResponse.json({
          title: "Canva design",
          description: null,
          image: derivedImage,
        });
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
      return NextResponse.json({ title: null, description: null, image: null });
    }

    // Only read first 100KB to avoid downloading huge pages
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ title: null, description: null, image: null });
    }

    let html = "";
    const decoder = new TextDecoder();
    let totalBytes = 0;
    const MAX_BYTES = 100 * 1024;

    while (totalBytes < MAX_BYTES) {
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
        if (m?.[1]) return m[1];
      }
      return null;
    }

    let title =
      getMeta("og:title") ??
      getMeta("twitter:title") ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
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

    const image = proxiedLinkPreviewImageUrl(
      getMeta("og:image") ??
        getMeta("twitter:image") ??
        getMeta("twitter:image:src") ??
        null,
      url
    );

    return NextResponse.json({ title, description, image });
  } catch (e) {
    console.error("[GET /api/link-preview]", e);
    return NextResponse.json({ title: null, description: null, image: null });
  }
}
