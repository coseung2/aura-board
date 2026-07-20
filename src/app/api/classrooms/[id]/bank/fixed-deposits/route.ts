import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureAccountFor } from "@/lib/bank";

const Body = z.object({
  principal: z.number().int().positive(),
}).strict();

const MATURITY_DAYS = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: classroomId } = await params;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "principal 필수" },
      { status: 400 }
    );
  }

  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (student.classroomId !== classroomId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Currency must have rate set
  const currency = await db.classroomCurrency.findUnique({
    where: { classroomId },
    select: { monthlyInterestRate: true },
  });
  if (!currency || currency.monthlyInterestRate === null) {
    return NextResponse.json(
      { error: "교사가 이자율을 설정하지 않아 적금 상품이 비활성화되어 있습니다" },
      { status: 400 }
    );
  }

  const { accountId } = await ensureAccountFor(student);
  const maturityDate = new Date(Date.now() + MATURITY_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await db.$transaction(async (tx) => {
      const debited = await tx.studentAccount.updateMany({
        where: { id: accountId, balance: { gte: parsed.data.principal } },
        data: { balance: { decrement: parsed.data.principal } },
      });
      if (debited.count === 0) throw new Error("insufficient_balance");
      const updated = await tx.studentAccount.findUniqueOrThrow({
        where: { id: accountId },
        select: { id: true, balance: true },
      });
      const fd = await tx.fixedDeposit.create({
        data: {
          accountId: updated.id,
          principal: parsed.data.principal,
          monthlyRate: currency.monthlyInterestRate as number,
          maturityDate,
          openedById: student.id,
          openedByKind: "owner",
        },
      });
      await tx.transaction.create({
        data: {
          accountId: updated.id,
          type: "fd_open",
          amount: parsed.data.principal,
          balanceAfter: updated.balance,
          fixedDepositId: fd.id,
          performedById: student.id,
          performedByKind: "owner",
        },
      });
      return { fd, balance: updated.balance };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "insufficient_balance") {
      return NextResponse.json({ error: "잔액 부족" }, { status: 400 });
    }
    throw err;
  }
}
