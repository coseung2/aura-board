import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";

const CreateBody = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  dueDate: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
});

// GET /api/classrooms/:id/checks
// Teacher: all tasks. Checker (student with checks.manage): only active tasks.
// Response: { tasks: [{ id, title, description, dueDate, isActive, submittedCount, totalStudents, createdAt }] }
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const where = isTeacher
    ? { classroomId }
    : { classroomId, isActive: true };

  const [tasks, totalStudents] = await Promise.all([
    db.classroomCheckTask.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { submissions: { where: { submitted: true } } } },
      },
    }),
    db.student.count({ where: { classroomId } }),
  ]);

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      isActive: t.isActive,
      submittedCount: t._count.submissions,
      totalStudents,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

// POST /api/classrooms/:id/checks
// Teacher-only. Body: { title, description?, dueDate? }. Creates an active task.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;

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
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값 확인 필요" }, { status: 400 });
  }

  const task = await db.classroomCheckTask.create({
    data: {
      classroomId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      dueDate: parsed.data.dueDate ?? null,
      isActive: true,
      createdById: user.id,
    },
  });

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      isActive: task.isActive,
      createdAt: task.createdAt.toISOString(),
    },
  });
}
