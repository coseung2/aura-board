import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { invalidateStudentIdentityCache } from "@/lib/student-auth";

const BatchDeleteSchema = z.object({
  studentIds: z.array(z.string()).min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;

    const classroom = await db.classroom.findUnique({ where: { id } });
    if (!classroom || classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { studentIds } = BatchDeleteSchema.parse(body);

    const result = await db.student.deleteMany({
      where: {
        id: { in: studentIds },
        classroomId: id,
      },
    });
    for (const studentId of studentIds) {
      invalidateStudentIdentityCache(studentId);
    }

    return NextResponse.json({ deleted: result.count });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/classroom/:id/students/batch-delete]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
