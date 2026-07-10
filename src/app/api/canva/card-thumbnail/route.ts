import { NextResponse } from "next/server";
import {
  expandCanvaShortLink,
  hasCanvaShareToken,
  isCanvaDesignUrl,
} from "@/lib/canva";

const ALLOWED_WIDTHS = new Set([160, 320, 640]);
const PUBLIC_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const FALLBACK_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";

/**
 * Always returns an image for a valid Canva card.
 *
 * /api/canva/thumbnail is intentionally allowed to return 404 when Canva has
 * no usable thumbnail. Board cards need a stronger contract: stream a fresh
 * thumbnail through our origin when possible, otherwise return a lightweight
 * visual fallback so the card never renders as a broken image.
 */
export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const rawDesignUrl = requestUrl.searchParams.get("design");
  const width = Number(requestUrl.searchParams.get("w") ?? "640");

  if (!rawDesignUrl || !isCanvaDesignUrl(rawDesignUrl)) {
    return NextResponse.json(
      { error: "valid Canva design URL required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_WIDTHS.has(width)) {
    return NextResponse.json(
      { error: "w must be one of 160|320|640" },
      { status: 400 },
    );
  }

  const designUrl = await expandCanvaShortLink(rawDesignUrl).catch(
    () => rawDesignUrl,
  );
  if (!isCanvaDesignUrl(designUrl)) {
    return NextResponse.json({ error: "invalid Canva design URL" }, { status: 400 });
  }

  const sourceUrl = new URL("/api/canva/thumbnail", requestUrl);
  sourceUrl.searchParams.set("design", designUrl);
  sourceUrl.searchParams.set("w", String(width));
  const deploymentShare = requestUrl.searchParams.get("_vercel_share");
  if (deploymentShare) {
    sourceUrl.searchParams.set("_vercel_share", deploymentShare);
  }

  const forwardedHeaders = new Headers({
    Accept: "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5",
  });
  for (const name of ["cookie", "authorization"]) {
    const value = req.headers.get(name);
    if (value) forwardedHeaders.set(name, value);
  }

  try {
    const upstream = await fetch(sourceUrl, {
      headers: forwardedHeaders,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (upstream.ok && upstream.body && contentType.startsWith("image/")) {
      const publicShare = hasCanvaShareToken(designUrl);
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": publicShare
            ? PUBLIC_CACHE_CONTROL
            : "private, no-store, max-age=0",
          ...(publicShare ? {} : { Vary: "Cookie, Authorization" }),
          "X-Canva-Thumbnail-Source": "resolved",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch {
    // Canva/network failures fall through to the always-image response below.
  }

  return fallbackThumbnail(width);
}

function fallbackThumbnail(width: number) {
  const height = Math.round((width * 9) / 16);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Canva 디자인 썸네일">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7d2ae8"/>
          <stop offset="1" stop-color="#00c4cc"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="18" fill="url(#bg)"/>
      <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.5)}" r="${Math.round(height * 0.2)}" fill="rgba(255,255,255,.18)"/>
      <text x="${Math.round(width * 0.18)}" y="${Math.round(height * 0.56)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(22, Math.round(height * 0.22))}" font-weight="700" fill="#fff">C</text>
      <text x="${Math.round(width * 0.32)}" y="${Math.round(height * 0.47)}" font-family="Arial, sans-serif" font-size="${Math.max(18, Math.round(height * 0.14))}" font-weight="700" fill="#fff">Canva 디자인</text>
      <text x="${Math.round(width * 0.32)}" y="${Math.round(height * 0.64)}" font-family="Arial, sans-serif" font-size="${Math.max(11, Math.round(height * 0.07))}" fill="rgba(255,255,255,.86)">클릭하여 디자인 열기</text>
    </svg>
  `.trim();

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": FALLBACK_CACHE_CONTROL,
      "X-Canva-Thumbnail-Source": "fallback",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
