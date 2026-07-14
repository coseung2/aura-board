import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteStudentWalkingStats } from "@/lib/walking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

// DELETE /api/classrooms/:id/walking/:studentId
// Delete all walking results for one student in a teacher-owned classroom.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id: classroomId, studentId } = await params;
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) return json({ error: "not_found" }, 404);
  if (classroom.teacherId !== user.id) return json({ error: "forbidden" }, 403);

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, classroomId: true },
  });
  if (!student || student.classroomId !== classroomId) {
    return json({ error: "student_not_found" }, 404);
  }

  const result = await deleteStudentWalkingStats(student.id);
  await logAudit({
    actorType: "teacher",
    actorId: user.id,
    action: "classroom.walking.delete",
    resourceType: "student_walking_stats",
    resourceId: student.id,
    metadata: { classroomId, deletedCount: result.count },
    req,
  });
  return json({ ok: true, studentId: student.id, deletedCount: result.count });
}
