import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getCurrentUser } from "@/lib/auth";
import { getClassroomGallery } from "@/lib/avatar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const classroomId = url.searchParams.get("classroomId");
  if (!classroomId) {
    return NextResponse.json(
      { error: "classroomId_required" },
      { status: 400 },
    );
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Teacher (owner of classroom) can always read.
  const teacher = await getCurrentUser().catch(() => null);
  if (teacher && teacher.id === classroom.teacherId) {
    const peers = await getClassroomGallery(classroomId);
    return NextResponse.json({ classroomId, students: peers });
  }

  // Student in the same classroom can read.
  const student = await getCurrentStudent().catch(() => null);
  if (student && student.classroomId === classroomId) {
    const peers = await getClassroomGallery(classroomId);
    return NextResponse.json({ classroomId, students: peers });
  }

  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
