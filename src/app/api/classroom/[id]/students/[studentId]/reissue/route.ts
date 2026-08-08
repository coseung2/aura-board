import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateQrToken, generateTextCode } from "@/lib/classroom-utils";
import { invalidateStudentIdentityCache } from "@/lib/student-auth";

export async function POST(
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

    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student || student.classroomId !== id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const newToken = generateQrToken();
    const newCode = await generateTextCode();

    const updated = await db.student.update({
      where: { id: studentId },
      data: { qrToken: newToken, textCode: newCode, sessionVersion: { increment: 1 } },
    });
    invalidateStudentIdentityCache(studentId);

    return NextResponse.json({
      student: { id: updated.id, name: updated.name, qrToken: updated.qrToken, textCode: updated.textCode },
    });
  } catch (e) {
    console.error("[POST /api/classroom/:id/students/:studentId/reissue]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
