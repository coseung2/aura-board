import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";

const Body = z.object({
  updates: z
    .array(
      z.object({
        studentId: z.string().min(1),
        submitted: z.boolean(),
      })
    )
    .min(1)
    .max(200),
});

// PUT /api/classrooms/:id/checks/:taskId/submissions
// Student checker upserts submission rows. Teacher (for simplicity) is also
// allowed but checkedById stays null so audit trail shows student-driven
// updates only when performed by a student.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: classroomId, taskId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "업데이트 항목 확인" },
      { status: 400 }
    );
  }

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = await db.classroomCheckTask.findUnique({
    where: { id: taskId },
    select: { id: true, classroomId: true, isActive: true },
  });
  if (!task || task.classroomId !== classroomId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Authorization: teacher (any) OR student with checks.manage permission.
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isTeacher = user?.id === classroom.teacherId;
  const checkerAllowed = !isTeacher
    ? await hasPermission(classroomId, { studentId: student?.id }, "checks.manage")
    : false;
  if (!isTeacher && !checkerAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isTeacher && !task.isActive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate every studentId belongs to this classroom.
  const studentIds = Array.from(new Set(parsed.data.updates.map((u) => u.studentId)));
  const validStudents = await db.student.findMany({
    where: { id: { in: studentIds }, classroomId },
    select: { id: true },
  });
  if (validStudents.length !== studentIds.length) {
    return NextResponse.json(
      { error: "학급에 속하지 않는 학생이 포함되어 있습니다" },
      { status: 400 }
    );
  }

  const now = new Date();
  const checkedById = student?.id ?? null;

  await db.$transaction(
    parsed.data.updates.map((u) =>
      db.classroomCheckSubmission.upsert({
        where: { taskId_studentId: { taskId, studentId: u.studentId } },
        create: {
          taskId,
          studentId: u.studentId,
          submitted: u.submitted,
          checkedById,
          checkedAt: now,
        },
        update: {
          submitted: u.submitted,
          checkedById,
          checkedAt: now,
        },
      })
    )
  );

  return NextResponse.json({ ok: true, count: parsed.data.updates.length });
}
