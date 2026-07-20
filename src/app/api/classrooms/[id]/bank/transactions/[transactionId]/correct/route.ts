import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  isCreditTransactionType,
  isManuallyCorrectableTransactionType,
  TRANSACTION_CORRECTION_SOURCE_TYPE,
} from "@/lib/bank-transactions";
import { db } from "@/lib/db";

const Body = z.object({
  reason: z.string().trim().min(1).max(200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "정정 사유를 입력하세요" }, { status: 400 });
  }

  const { id: classroomId, transactionId } = await params;
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

  const original = await db.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      accountId: true,
      type: true,
      amount: true,
      performedByKind: true,
      account: { select: { classroomId: true } },
    },
  });
  if (!original || original.account.classroomId !== classroomId) {
    return NextResponse.json({ error: "거래를 찾을 수 없습니다" }, { status: 404 });
  }
  if (
    !isManuallyCorrectableTransactionType(original.type) ||
    (original.performedByKind !== "teacher" && original.performedByKind !== "banker")
  ) {
    return NextResponse.json(
      { error: "교사가 직접 입금하거나 출금한 거래만 정정할 수 있습니다" },
      { status: 400 },
    );
  }

  const existing = await db.transaction.findUnique({
    where: {
      sourceType_sourceRef: {
        sourceType: TRANSACTION_CORRECTION_SOURCE_TYPE,
        sourceRef: original.id,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "이미 정정된 거래입니다" }, { status: 409 });
  }

  const originalWasCredit = isCreditTransactionType(original.type);
  try {
    const result = await db.$transaction(async (tx) => {
      if (originalWasCredit) {
        const changed = await tx.studentAccount.updateMany({
          where: { id: original.accountId, balance: { gte: original.amount } },
          data: { balance: { decrement: original.amount } },
        });
        if (changed.count === 0) throw new Error("insufficient_balance_for_correction");
      } else {
        await tx.studentAccount.update({
          where: { id: original.accountId },
          data: { balance: { increment: original.amount } },
        });
      }
      const account = await tx.studentAccount.findUniqueOrThrow({
        where: { id: original.accountId },
        select: { balance: true },
      });
      const correction = await tx.transaction.create({
        data: {
          accountId: original.accountId,
          type: originalWasCredit ? "correction_debit" : "correction_credit",
          amount: original.amount,
          balanceAfter: account.balance,
          note: `거래 정정: ${parsed.data.reason}`,
          sourceType: TRANSACTION_CORRECTION_SOURCE_TYPE,
          sourceRef: original.id,
          performedById: user.id,
          performedByKind: "teacher",
        },
        select: { id: true },
      });
      return { balance: account.balance, transactionId: correction.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_balance_for_correction") {
      return NextResponse.json(
        { error: "현재 잔액이 부족해 이 입금 거래를 전액 정정할 수 없습니다" },
        { status: 409 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "이미 정정된 거래입니다" }, { status: 409 });
    }
    throw error;
  }
}
