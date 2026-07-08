import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getCurrentUser } from "@/lib/auth";
import { resizeBufferToWebPPreview, uploadWebPBuffer } from "@/lib/blob";
import { normalizeUploadMime } from "@/lib/file-attachment";
import { uploadPublicObject } from "@/lib/media-storage";

// Drawpile student-asset library (partial scope). Uploads go to public/uploads/
// same as /api/upload; this route additionally creates a StudentAsset row so the
// library sidebar + classroom gallery can surface the asset. When the Drawpile
// fork's postMessage bridge ships, a parallel path will create rows via a
// separate ingest endpoint — see docs/drawpile-protocol.md.

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_SIZE = 4 * 1024 * 1024;
const CONTENT_LENGTH_OVERHEAD = 32 * 1024;

export async function POST(req: Request) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "Student session required" }, { status: 401 });
    }

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const declared = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(declared) && declared > MAX_SIZE + CONTENT_LENGTH_OVERHEAD) {
        return NextResponse.json(
          { error: "File too large. Student asset uploads support up to 4MB." },
          { status: 413 },
        );
      }
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string | null)?.slice(0, 200) ?? "";
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Student asset uploads support up to 4MB." },
        { status: 413 },
      );
    }
    const normalizedMime = normalizeUploadMime(file.type ?? "", file.name);
    if (!ALLOWED_IMAGE.has(normalizedMime)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${normalizedMime}` },
        { status: 400 }
      );
    }

    const source = ((form.get("source") as string | null) ?? "upload").slice(0, 20);
    const isSharedToClass = form.get("isSharedToClass") === "true";

    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : normalizedMime.split("/")[1] ?? "png";
    // sanitize — only alnum extension
    const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "png";
    const filename = `asset-${Date.now()}-${randomBytes(3).toString("hex")}.${safeExt}`;
    const pathname = `student-assets/${student.id}/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Supabase Storage 우선. 환경변수가 없으면 기존 Vercel Blob/로컬 fs로
    // fallback 하여 로컬 개발과 임시 롤백이 가능하게 둔다.
    const stored = await uploadPublicObject(pathname, buffer, {
      contentType: normalizedMime,
      multipart: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    const fileUrl = stored.url;

    let thumbnailUrl: string | null = null;
    try {
      const preview = await resizeBufferToWebPPreview(buffer, 480, 75);
      thumbnailUrl = await uploadWebPBuffer(
        preview,
        `student-assets/${student.id}/thumb-${Date.now()}-${randomBytes(3).toString("hex")}.webp`
      );
    } catch (e) {
      console.warn("[POST /api/student-assets] thumbnail generation failed:", e);
    }

    const asset = await db.studentAsset.create({
      data: {
        studentId: student.id,
        classroomId: student.classroomId,
        title,
        fileUrl,
        thumbnailUrl,
        format: normalizedMime,
        sizeBytes: file.size,
        source,
        isSharedToClass,
      },
    });

    return NextResponse.json({
      asset: {
        id: asset.id,
        title: asset.title,
        fileUrl: asset.fileUrl,
        thumbnailUrl: asset.thumbnailUrl,
        format: asset.format,
        createdAt: asset.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error("[POST /api/student-assets]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

const QuerySchema = z.object({
  scope: z.enum(["mine", "shared"]).default("mine"),
  classroomId: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      scope: url.searchParams.get("scope") ?? undefined,
      classroomId: url.searchParams.get("classroomId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid query" }, { status: 400 });
    }
    const { scope, classroomId } = parsed.data;

    if (scope === "mine") {
      const student = await getCurrentStudent();
      if (!student) {
        return NextResponse.json({ assets: [] });
      }
      const rows = await db.studentAsset.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ assets: rows.map(toDTO) });
    }

    // scope === "shared"
    if (!classroomId) {
      return NextResponse.json({ error: "classroomId required for shared scope" }, { status: 400 });
    }
    // Access control: teacher owns the classroom OR current student is in it.
    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);
    let allowed = false;
    if (student && student.classroomId === classroomId) allowed = true;
    if (!allowed && user) {
      const classroom = await db.classroom.findUnique({ where: { id: classroomId } });
      if (classroom && classroom.teacherId === user.id) allowed = true;
    }
    if (!allowed) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const rows = await db.studentAsset.findMany({
      where: { classroomId, isSharedToClass: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ assets: rows.map(toDTO) });
  } catch (e) {
    console.error("[GET /api/student-assets]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function toDTO(row: {
  id: string;
  title: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  format: string;
  createdAt: Date;
  studentId: string;
}) {
  return {
    id: row.id,
    title: row.title,
    fileUrl: row.fileUrl,
    thumbnailUrl: row.thumbnailUrl,
    format: row.format,
    studentId: row.studentId,
    createdAt: row.createdAt.toISOString(),
  };
}
