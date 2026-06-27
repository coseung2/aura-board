import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";

const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  dueDate: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  isActive: z.boolean().optional(),
});

async function loadTask(classroomId: string, taskId: string) {
  return db.classroomCheckTask.findUnique({ where: { id: taskId } });
}

// GET /api/classrooms/:id/checks/:taskId
// Teacher or checker. Returns task + roster with per-student submission state.
// Roster ordered by student.number asc, then createdAt asc.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: classroomId, taskId } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = await loadTask(classroomId, taskId);
  if (!task || task.classroomId !== classroomId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  const [students, submissions] = await Promise.all([
    db.student.findMany({
      where: { classroomId },
      orderBy: [{ number: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, number: true },
    }),
    db.classroomCheckSubmission.findMany({
      where: { taskId },
    }),
  ]);

  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      isActive: task.isActive,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    },
    roster: students.map((s) => {
      const sub = byStudent.get(s.id);
      return {
        student: { id: s.id, name: s.name, number: s.number },
        submission: sub
          ? {
              id: sub.id,
              submitted: sub.submitted,
              checkedAt: sub.checkedAt ? sub.checkedAt.toISOString() : null,
              checkedById: sub.checkedById,
            }
          : null,
      };
    }),
  });
}

// PATCH /api/classrooms/:id/checks/:taskId
// Teacher-only. Update title/description/dueDate/isActive.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: classroomId, taskId } = await params;

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값 확인" }, { status: 400 });
  }

  const task = await loadTask(classroomId, taskId);
  if (!task || task.classroomId !== classroomId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.classroomCheckTask.update({
    where: { id: taskId },
    data: parsed.data,
  });

  return NextResponse.json({
    task: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/classrooms/:id/checks/:taskId
// Teacher-only. Cascades to submissions.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: classroomId, taskId } = await params;

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await loadTask(classroomId, taskId);
  if (!task || task.classroomId !== classroomId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.classroomCheckTask.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
