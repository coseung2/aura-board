import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getCurrentUser } from "@/lib/auth";
import { resizeBufferToWebPPreview, uploadWebPBuffer } from "@/lib/blob";

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
const MAX_SIZE = 50 * 1024 * 1024; // 50MB — parity with /api/upload

export async function POST(req: Request) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "Student session required" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string | null)?.slice(0, 200) ?? "";
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 });
    }
    if (!ALLOWED_IMAGE.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    const source = ((form.get("source") as string | null) ?? "upload").slice(0, 20);
    const isSharedToClass = form.get("isSharedToClass") === "true";

    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : file.type.split("/")[1] ?? "png";
    // sanitize — only alnum extension
    const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "png";
    const filename = `asset-${Date.now()}-${randomBytes(3).toString("hex")}.${safeExt}`;
    const pathname = `student-assets/${student.id}/${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Prefer Vercel Blob — fs writes are ephemeral on Lambda. Fall back to
    // public/uploads/ only for local dev without BLOB_READ_WRITE_TOKEN.
    let fileUrl: string;
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (blobToken) {
      try {
        const res = await put(pathname, buffer, {
          access: "public",
          contentType: file.type,
          token: blobToken,
          multipart: true,
          addRandomSuffix: false,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        });
        fileUrl = res.url;
      } catch (e) {
        console.error("[POST /api/student-assets] blob put failed:", e);
        return NextResponse.json({ error: "Blob upload failed" }, { status: 500 });
      }
    } else {
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, filename), buffer);
      fileUrl = `/uploads/${filename}`;
    }

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
        format: file.type,
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
