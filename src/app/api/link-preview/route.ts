import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
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

    let image =
      getMeta("og:image") ??
      getMeta("twitter:image") ??
      null;

    // Cache the OG image locally (Canva and others block direct hotlinking)
    if (image) {
      try {
        const imgRes = await fetch(image, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Referer: url,
          },
          signal: AbortSignal.timeout(8000),
        });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const ext = image.includes(".png") ? "png" : "jpg";
          const filename = `og-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const uploadDir = path.join(process.cwd(), "public", "uploads");
          await writeFile(path.join(uploadDir, filename), buffer);
          image = `/uploads/${filename}`;
        }
      } catch {
        // Keep remote URL as fallback
      }
    }

    return NextResponse.json({ title, description, image });
  } catch (e) {
    console.error("[GET /api/link-preview]", e);
    return NextResponse.json({ title: null, description: null, image: null });
  }
}
