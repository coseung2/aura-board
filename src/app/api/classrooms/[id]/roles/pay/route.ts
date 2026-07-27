import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureAccountFor } from "@/lib/bank";

const Body = z.object({
  roleKey: z.string().min(1),
});

// POST /api/classrooms/:id/roles/pay
// Pays the role's salary once to every student currently holding it. Teacher
// only; used by the 수동지급 action on the dashboard role tile.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "roleKey 필수" }, { status: 400 });
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

  const role = await db.classroomRoleDef.findUnique({
    where: { key: parsed.data.roleKey },
    select: { id: true, labelKo: true },
  });
  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  const setting = await db.classroomRoleSetting.findUnique({
    where: {
      classroomId_classroomRoleId: { classroomId, classroomRoleId: role.id },
    },
    select: { enabled: true, salaryAmount: true },
  });
  if (!setting?.enabled) {
    return NextResponse.json({ error: "Role is disabled" }, { status: 409 });
  }
  if (setting.salaryAmount <= 0) {
    return NextResponse.json(
      { error: "급여가 0원인 역할은 지급할 수 없습니다." },
      { status: 400 },
    );
  }

  const assignments = await db.classroomRoleAssignment.findMany({
    where: { classroomId, classroomRoleId: role.id },
    select: { studentId: true, student: { select: { id: true, classroomId: true } } },
  });
  if (assignments.length === 0) {
    return NextResponse.json(
      { error: "지급할 담당 학생이 없습니다." },
      { status: 400 },
    );
  }

  const amount = setting.salaryAmount;
  const note = `${role.labelKo} 급여`;

  // Mirrors /bank/deposit: balance increment + transaction row per student.
  for (const assignment of assignments) {
    const { accountId } = await ensureAccountFor(assignment.student);
    await db.$transaction(async (tx) => {
      const updated = await tx.studentAccount.update({
        where: { id: accountId },
        data: { balance: { increment: amount } },
        select: { id: true, balance: true },
      });
      await tx.transaction.create({
        data: {
          accountId: updated.id,
          type: "deposit",
          amount,
          balanceAfter: updated.balance,
          note,
          performedById: user.id,
          performedByKind: "teacher",
        },
      });
    });
  }

  return NextResponse.json({
    roleKey: parsed.data.roleKey,
    paidStudents: assignments.length,
    amount,
  });
}
