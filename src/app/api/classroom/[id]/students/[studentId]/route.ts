import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";

const UpdateStudentSchema = z.object({
  gender: z.enum(["male", "female"]).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { id, studentId } = await params;

    const classroom = await db.classroom.findUnique({ where: { id } });
    if (!classroom || classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const input = UpdateStudentSchema.parse(body);
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true, classroomId: true },
    });
    if (!student || student.classroomId !== id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const updated = await db.student.update({
      where: { id: studentId },
      data: { gender: input.gender ?? null },
      select: { id: true, gender: true },
    });

    return NextResponse.json({ student: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/classroom/:id/students/:studentId]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { id, studentId } = await params;

    const classroom = await db.classroom.findUnique({ where: { id } });
    if (!classroom || classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { assets: true },
    });
    if (!student || student.classroomId !== id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const blobUrls = student.assets.flatMap((asset) => [
      asset.fileUrl,
      asset.thumbnailUrl,
    ]);

    await db.student.delete({ where: { id: studentId } });
    await enqueueBlobDeletion(blobUrls, "student.delete", "Student", studentId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[DELETE /api/classroom/:id/students/:studentId]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
