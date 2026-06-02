import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureClassroomCurrency } from "@/lib/bank";
import { hasPermission } from "@/lib/bank-permissions";

// GET /api/classrooms/:id/bank/overview
// Teacher → full view; banker → abbreviated view (own-processed txns).
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
  const isBanker = !isTeacher
    ? await hasPermission(classroomId, { studentId: student?.id }, "bank.deposit")
    : false;
  const canCancelFD = isTeacher
    ? true
    : await hasPermission(classroomId, { studentId: student?.id }, "bank.fd.cancel");
  if (!isTeacher && !isBanker) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currency = await ensureClassroomCurrency(classroomId);

  // Students + accounts
  const students = await db.student.findMany({
    where: { classroomId },
    orderBy: [{ number: "asc" }, { createdAt: "asc" }],
    include: { account: true },
  });

  // Active FDs
  const activeFDs = await db.fixedDeposit.findMany({
    where: { status: "active", account: { classroomId } },
    orderBy: { maturityDate: "asc" },
  });

  // Recent transactions (teacher: all; banker: own). Note: `performedByKind:"owner"`
  // rows (a student cancelling their own deposit) are intentionally excluded
  // from the banker's "내가 처리한 거래" feed — those happened through the
  // student portal, not the banker workflow. Teacher view still sees them.
  const recentTransactions = await db.transaction.findMany({
    where: {
      account: { classroomId },
      ...(isTeacher
        ? {}
        : { performedById: student?.id ?? "__nope__", performedByKind: "banker" }),
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const totalBalance = students.reduce(
    (sum, s) => sum + (s.account?.balance ?? 0),
    0
  );
  const activeFDTotal = activeFDs.reduce((sum, fd) => sum + fd.principal, 0);

  return NextResponse.json({
    currency: {
      unitLabel: currency.unitLabel,
      monthlyInterestRate: currency.monthlyInterestRate,
    },
    students: students.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      balance: s.account?.balance ?? 0,
      accountId: s.account?.id ?? null,
    })),
    activeFDs: activeFDs.map((fd) => ({
      id: fd.id,
      accountId: fd.accountId,
      principal: fd.principal,
      monthlyRate: fd.monthlyRate,
      startDate: fd.startDate.toISOString(),
      maturityDate: fd.maturityDate.toISOString(),
    })),
    totals: { totalBalance, activeFDTotal },
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      note: t.note,
      performedByKind: t.performedByKind,
      createdAt: t.createdAt.toISOString(),
    })),
    viewerKind: isTeacher ? "teacher" : "banker",
    canCancelFD,
  });
}
