import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureAccountFor } from "@/lib/bank";
import { getWalletTransactionDisplay } from "@/lib/wallet-transaction-display";

// GET /api/my/wallet
// Student-only. Returns balance + card display info + active FDs + recent transactions.
export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId, cardId } = await ensureAccountFor({
    id: student.id,
    classroomId: student.classroomId,
  });

  const [account, card, fds, txns, currency] = await Promise.all([
    db.studentAccount.findUnique({
      where: { id: accountId },
      select: { id: true, balance: true },
    }),
    db.studentCard.findUnique({
      where: { id: cardId },
      select: { id: true, cardNumber: true, status: true, issuedAt: true },
    }),
    db.fixedDeposit.findMany({
      where: { accountId, status: "active" },
      orderBy: { maturityDate: "asc" },
    }),
    db.transaction.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.classroomCurrency.findUnique({
      where: { classroomId: student.classroomId },
      select: { unitLabel: true, monthlyInterestRate: true },
    }),
  ]);

  return NextResponse.json({
    studentName: student.name,
    classroomId: student.classroomId,
    balance: account?.balance ?? 0,
    currency: {
      unitLabel: currency?.unitLabel ?? "원",
      monthlyInterestRate: currency?.monthlyInterestRate ?? null,
    },
    card: card && {
      id: card.id,
      cardNumber: card.cardNumber,
      status: card.status,
    },
    activeFDs: fds.map((fd) => ({
      id: fd.id,
      principal: fd.principal,
      monthlyRate: fd.monthlyRate,
      startDate: fd.startDate.toISOString(),
      maturityDate: fd.maturityDate.toISOString(),
    })),
    recentTransactions: txns.map((t) => {
      const display = getWalletTransactionDisplay({
        type: t.type,
        note: t.note,
        sourceType: t.sourceType,
      });
      return {
        id: t.id,
        type: t.type,
        typeLabel: display.typeLabel,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        note: t.note,
        displayNote: display.noteLabel,
        sourceType: t.sourceType,
        createdAt: t.createdAt.toISOString(),
      };
    }),
  });
}
