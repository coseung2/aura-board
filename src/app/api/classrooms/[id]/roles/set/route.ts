import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const SetBody = z.object({
  studentId: z.string().min(1),
  roleKey: z.string().min(1).nullable(),
});

// PUT /api/classrooms/:id/roles/set
// Enforces "one role per student": drops existing assignments for
// (classroomId, studentId) and optionally inserts a new one.
// roleKey = null → student has no role.
export async function PUT(
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
  const parsed = SetBody.safeParse(body);
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
    select: { teacherId: true },
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

  let newRoleId: string | null = null;
  if (parsed.data.roleKey !== null) {
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
    newRoleId = role.id;
  }

  const assignment = await db.$transaction(async (tx) => {
    await tx.classroomRoleAssignment.deleteMany({
      where: { classroomId, studentId: student.id },
    });
    if (newRoleId) {
      return tx.classroomRoleAssignment.create({
        data: {
          classroomId,
          studentId: student.id,
          classroomRoleId: newRoleId,
          assignedById: user.id,
        },
      });
    }
    return null;
  });

  return NextResponse.json({ assignment });
}
