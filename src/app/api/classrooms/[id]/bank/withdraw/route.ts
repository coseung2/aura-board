import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { ensureAccountFor } from "@/lib/bank";

const Body = z.object({
  studentId: z.string().min(1),
  amount: z.number().int().positive(),
  note: z.string().max(200).optional(),
});

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
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "studentId / amount 필수" },
      { status: 400 }
    );
  }

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await hasPermission(
    classroomId,
    { userId: user?.id, studentId: student?.id },
    "bank.withdraw"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await db.student.findUnique({
    where: { id: parsed.data.studentId },
    select: { id: true, classroomId: true },
  });
  if (!target || target.classroomId !== classroomId) {
    return NextResponse.json(
      { error: "학급 소속 학생이 아닙니다" },
      { status: 400 }
    );
  }

  const { accountId } = await ensureAccountFor(target);
  const performerId = user?.id ?? student?.id ?? "system";
  const performerKind = user ? "teacher" : "banker";

  try {
    const txResult = await db.$transaction(async (tx) => {
      const debited = await tx.studentAccount.updateMany({
        where: { id: accountId, balance: { gte: parsed.data.amount } },
        data: { balance: { decrement: parsed.data.amount } },
      });
      if (debited.count === 0) throw new Error("insufficient_balance");
      const updated = await tx.studentAccount.findUniqueOrThrow({
        where: { id: accountId },
        select: { id: true, balance: true },
      });
      const trx = await tx.transaction.create({
        data: {
          accountId: updated.id,
          type: "withdraw",
          amount: parsed.data.amount,
          balanceAfter: updated.balance,
          note: parsed.data.note ?? null,
          performedById: performerId,
          performedByKind: performerKind,
        },
      });
      return { balance: updated.balance, transactionId: trx.id };
    });
    return NextResponse.json({ ok: true, ...txResult });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "insufficient_balance") {
      return NextResponse.json(
        { error: "잔액 부족" },
        { status: 409 }
      );
    }
    throw err;
  }
}
