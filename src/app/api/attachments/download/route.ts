import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  isSupabaseStoragePublicUrl,
  parseSupabasePublicObjectUrl,
} from "@/lib/media-storage";

export async function GET(req: Request) {
  try {
    const teacher = await getCurrentUser().catch(() => null);
    if (!teacher) {
      const student = await getCurrentStudent();
      if (!student) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const requestUrl = new URL(req.url);
    const rawUrl = requestUrl.searchParams.get("url");
    const rawFilename = requestUrl.searchParams.get("filename");
    if (!rawUrl) {
      return NextResponse.json({ error: "missing url" }, { status: 400 });
    }

    const sourceUrl = resolveUploadUrl(rawUrl, requestUrl.origin);
    if (!sourceUrl) {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }

    const res = await fetch(sourceUrl, {
      headers: {
        accept: "application/octet-stream,*/*",
      },
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      return NextResponse.json(
        { error: `download failed (${res.status})` },
        { status: 502 },
      );
    }

    const filename = sanitizeDownloadName(rawFilename) ?? fallbackName(sourceUrl);
    const headers = new Headers();
    headers.set(
      "content-type",
      res.headers.get("content-type") ?? "application/octet-stream",
    );
    const length = res.headers.get("content-length");
    if (length) headers.set("content-length", length);
    headers.set("cache-control", "no-store");
    headers.set("content-disposition", buildContentDisposition(filename));

    return new NextResponse(res.body, { status: 200, headers });
  } catch (e) {
    console.error("[GET /api/attachments/download]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function resolveUploadUrl(rawUrl: string, origin: string): string | null {
  try {
    const sourceUrl = rawUrl.startsWith("/")
      ? new URL(rawUrl, origin)
      : new URL(rawUrl);
    if (sourceUrl.protocol !== "https:" && sourceUrl.protocol !== "http:") {
      return null;
    }

    if (
      sourceUrl.origin === origin &&
      sourceUrl.pathname.startsWith("/uploads/")
    ) {
      return sourceUrl.toString();
    }

    const parsed = parseSupabasePublicObjectUrl(sourceUrl.toString());
    if (parsed) {
      return isAllowedObjectPath(parsed.pathname) ? sourceUrl.toString() : null;
    }

    if (isSupabaseStoragePublicUrl(sourceUrl)) {
      const path = decodeURIComponent(sourceUrl.pathname);
      return path.includes("/uploads/") && !path.includes("/uploads/previews/")
        ? sourceUrl.toString()
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

function isAllowedObjectPath(pathname: string): boolean {
  return pathname.startsWith("uploads/") && !pathname.startsWith("uploads/previews/");
}

function sanitizeDownloadName(value: string | null): string | null {
  const cleaned = value
    ?.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 180);
}

function fallbackName(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const last = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    return sanitizeDownloadName(last) ?? "download";
  } catch {
    return "download";
  }
}

function buildContentDisposition(filename: string): string {
  const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const utf8Name = encodeURIComponent(filename);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}
