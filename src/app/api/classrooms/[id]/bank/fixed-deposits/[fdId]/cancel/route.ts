import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";

class FixedDepositAlreadyCancelled extends Error {
  constructor() {
    super("FixedDeposit already cancelled by a concurrent request");
  }
}

// Early withdrawal: principal-only return. No interest.
// Permission rules:
//   - Teacher of the classroom: always allowed.
//   - Banker role: requires `bank.fd.cancel` permission (default grant).
//   - Owner of the FD: the student whose account holds this deposit is
//     always allowed to cancel their own deposit, even without any role.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; fdId: string }> }
) {
  const { id: classroomId, fdId } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fd = await db.fixedDeposit.findUnique({
    where: { id: fdId },
    include: {
      account: {
        select: { id: true, classroomId: true, studentId: true },
      },
    },
  });
  if (!fd || fd.account.classroomId !== classroomId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (fd.status !== "active") {
    return NextResponse.json(
      { error: "이미 처리된 적금입니다" },
      { status: 400 }
    );
  }

  // Permission resolution: owners may cancel only their own FD, while
  // teacher/banker permission still wins for audit attribution.
  const isOwner = !!student && fd.account.studentId === student.id;
  const hasCatalogPermission = await hasPermission(
    classroomId,
    { userId: user?.id, studentId: student?.id },
    "bank.fd.cancel"
  );
  const allowed = isOwner || hasCatalogPermission;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const performerId = user?.id ?? student?.id ?? "system";
  const performerKind = user
    ? "teacher"
    : hasCatalogPermission
      ? "banker"
      : "owner";

  try {
    const result = await db.$transaction(async (tx) => {
      // Claim the FD before touching the account, matching fd-maturity's lock
      // order and avoiding deadlocks when a maturity sweep races with manual
      // cancellation. If another request already claimed it, no balance change
      // or transaction row is created.
      const flip = await tx.fixedDeposit.updateMany({
        where: { id: fd.id, status: "active" },
        data: { status: "early_withdrawn", maturedAt: new Date() },
      });
      if (flip.count === 0) {
        throw new FixedDepositAlreadyCancelled();
      }
      const updated = await tx.studentAccount.update({
        where: { id: fd.account.id },
        data: { balance: { increment: fd.principal } },
        select: { id: true, balance: true },
      });
      const trx = await tx.transaction.create({
        data: {
          accountId: updated.id,
          type: "fd_cancelled",
          amount: fd.principal,
          balanceAfter: updated.balance,
          fixedDepositId: fd.id,
          note: "적금 중도해지 (원금만 반환)",
          performedById: performerId,
          performedByKind: performerKind,
        },
      });
      return { balance: updated.balance, transactionId: trx.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof FixedDepositAlreadyCancelled) {
      return NextResponse.json(
        { error: "이미 처리된 적금입니다" },
        { status: 409 }
      );
    }
    throw err;
  }
}
