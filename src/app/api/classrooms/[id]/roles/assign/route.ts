import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const AssignBody = z.object({
  studentId: z.string().min(1),
  roleKey: z.string().min(1),
});

// POST /api/classrooms/:id/roles/assign
// Assigns a classroom role to a student. Teacher-only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = AssignBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "studentId/roleKey 필수" },
      { status: 400 }
    );
  }

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = await db.student.findUnique({
    where: { id: parsed.data.studentId },
    select: { id: true, classroomId: true },
  });
  if (!student || student.classroomId !== classroomId) {
    return NextResponse.json(
      { error: "학급 소속 학생이 아닙니다" },
      { status: 400 }
    );
  }

  const role = await db.classroomRoleDef.findUnique({
    where: { key: parsed.data.roleKey },
    select: { id: true },
  });
  if (!role) {
    return NextResponse.json(
      { error: "정의되지 않은 역할" },
      { status: 400 }
    );
  }

  const roleSetting = await db.classroomRoleSetting.findUnique({
    where: {
      classroomId_classroomRoleId: {
        classroomId,
        classroomRoleId: role.id,
      },
    },
    select: { enabled: true },
  });
  if (roleSetting?.enabled === false) {
    return NextResponse.json({ error: "Role is disabled" }, { status: 409 });
  }

  try {
    const assignment = await db.classroomRoleAssignment.create({
      data: {
        classroomId,
        studentId: student.id,
        classroomRoleId: role.id,
        assignedById: user.id,
      },
    });
    return NextResponse.json({ assignment });
  } catch (err: unknown) {
    // Prisma P2002 = unique violation (already assigned).
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json(
        { error: "이미 부여된 역할입니다" },
        { status: 409 }
      );
    }
    throw err;
  }
}
