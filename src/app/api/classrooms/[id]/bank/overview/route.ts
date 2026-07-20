import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureClassroomCurrency } from "@/lib/bank";
import { hasPermission } from "@/lib/bank-permissions";
import {
  isManuallyCorrectableTransactionType,
  TRANSACTION_CORRECTION_SOURCE_TYPE,
} from "@/lib/bank-transactions";

// GET /api/classrooms/:id/bank/overview
// Teacher → full view; banker → abbreviated view (own-processed txns).
export async function GET(
  request: Request,
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
  const pageSize = 30;
  const rawPage = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

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

  // Transactions (teacher: full history; banker: own recent activity). Note: `performedByKind:"owner"`
  // rows (a student cancelling their own deposit) are intentionally excluded
  // from the banker's "내가 처리한 거래" feed — those happened through the
  // student portal, not the banker workflow. Teacher view still sees them.
  const transactionWhere = {
    account: { classroomId },
    ...(isTeacher
      ? {}
      : { performedById: student?.id ?? "__nope__", performedByKind: "banker" }),
  };
  const totalTransactions = await db.transaction.count({ where: transactionWhere });
  const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize));
  const page = isTeacher ? Math.min(requestedPage, totalPages) : 1;
  const transactions = await db.transaction.findMany({
    where: transactionWhere,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      account: {
        select: {
          student: { select: { id: true, name: true, number: true } },
        },
      },
    },
  });
  const correctionRows = await db.transaction.findMany({
    where: {
      sourceType: TRANSACTION_CORRECTION_SOURCE_TYPE,
      sourceRef: { in: transactions.map((transaction) => transaction.id) },
    },
    select: { sourceRef: true },
  });
  const correctedTransactionIds = new Set(
    correctionRows
      .map((transaction) => transaction.sourceRef)
      .filter((sourceRef): sourceRef is string => Boolean(sourceRef)),
  );

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
    recentTransactions: transactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      student: t.account.student,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      note: t.note,
      sourceType: t.sourceType,
      sourceRef: t.sourceRef,
      performedByKind: t.performedByKind,
      createdAt: t.createdAt.toISOString(),
      corrected: correctedTransactionIds.has(t.id),
      correctable:
        isTeacher &&
        isManuallyCorrectableTransactionType(t.type) &&
        (t.performedByKind === "teacher" || t.performedByKind === "banker") &&
        !correctedTransactionIds.has(t.id),
    })),
    transactionPagination: {
      page,
      pageSize,
      total: totalTransactions,
      totalPages,
    },
    viewerKind: isTeacher ? "teacher" : "banker",
    canCancelFD,
  });
}
