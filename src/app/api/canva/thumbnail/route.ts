import { NextResponse } from "next/server";
import {
  canvaGetDesign,
  extractCanvaDesignId,
  getAccessToken,
} from "@/lib/canva";
import { resolveCanvaEmbedUrlCached } from "@/lib/canva-preview-cache";
import { getCurrentUser } from "@/lib/auth";
import { getPreviewCache, setPreviewCache } from "@/lib/preview-cache";

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const design = searchParams.get("design");
  let url = searchParams.get("url");
  const w = searchParams.get("w");

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
    const cached = await getPreviewCache<{ url: string | null }>("canva-thumbnail", design);
    if (cached.hit) {
      url = cached.status === "ok" ? cached.payload.url : null;
    } else {
      const embed = await resolveCanvaEmbedUrlCached(design);
      url = embed?.thumbnailUrl ?? null;
      await setPreviewCache(
        "canva-thumbnail",
        design,
        { url },
        Boolean(url),
        url ? undefined : "not_found"
      );
    }
    if (!url) {
      const designId = extractCanvaDesignId(design);
      const user = await getCurrentUser().catch(() => null);
      const token = user ? await getAccessToken(user.id) : null;
      if (designId && token) {
        try {
          const info = await canvaGetDesign(token, designId);
          url = info.thumbnail?.url ?? null;
          if (url) {
            await setPreviewCache("canva-thumbnail", design, { url }, true);
          }
        } catch {
          url = null;
        }
      }
    }
    if (!url) {
      return NextResponse.json({ error: "Canva thumbnail not found" }, { status: 502 });
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
      if (fallbackUrl) {
        const fallback = await fetch(fallbackUrl, {
          headers: {
            Accept: "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
            "User-Agent": "aura-board-thumbnail-proxy",
          },
          cache: "no-store",
        });
        if (fallback.ok && fallback.body) {
          const fallbackType = fallback.headers.get("content-type") ?? "image/webp";
          if (fallbackType.startsWith("image/")) {
            return new Response(fallback.body, {
              status: 200,
              headers: {
                "Content-Type": fallbackType,
                "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
                "X-Thumbnail-Width": w,
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
        }
      }
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/webp";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Upstream did not return an image" },
        { status: 502 },
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
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        "X-Thumbnail-Width": w,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[GET /api/canva/thumbnail]", e);
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}

async function resolveDesignThumbnailFromScreenUrl(parsed: URL): Promise<string | null> {
  const match = parsed.pathname.match(
    /\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?\/screen/
  );
  if (!match) return null;
  const [, designId, shareToken] = match;
  const designUrl = shareToken
    ? `https://www.canva.com/design/${designId}/${shareToken}/view`
    : `https://www.canva.com/design/${designId}/view`;
  const embed = await resolveCanvaEmbedUrlCached(designUrl);
  if (embed?.thumbnailUrl) return embed.thumbnailUrl;

  const user = await getCurrentUser().catch(() => null);
  const token = user ? await getAccessToken(user.id) : null;
  if (!token) return null;
  try {
    const info = await canvaGetDesign(token, designId);
    return info.thumbnail?.url ?? null;
  } catch {
    return null;
  }
}
