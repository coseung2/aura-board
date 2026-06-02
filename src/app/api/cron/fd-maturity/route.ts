import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Daily maturity sweep. Scheduled via vercel.json at 00:05 KST (15:05 UTC).
 *
 * Vercel invokes cron GETs with an `Authorization: Bearer <CRON_SECRET>`
 * header. We verify it to reject random callers.
 *
 * Idempotent — filters by `status="active"` + `maturityDate <= now`, so a
 * double-invocation processes the same fixed deposit at most once.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const mature = await db.fixedDeposit.findMany({
    where: { status: "active", maturityDate: { lte: now } },
    select: { id: true, accountId: true, principal: true, monthlyRate: true },
  });

  let processed = 0;
  for (const fd of mature) {
    try {
      const didProcess = await db.$transaction(async (tx) => {
        // Atomically claim the deposit before paying out. This prevents a race
        // with manual early-withdrawal: only the request that flips
        // status="active" to its terminal state may touch the balance.
        const claim = await tx.fixedDeposit.updateMany({
          where: { id: fd.id, status: "active" },
          data: { status: "matured", maturedAt: now },
        });
        if (claim.count === 0) return false;

        const interest = Math.floor(fd.principal * (fd.monthlyRate / 100));
        const payout = fd.principal + interest;

        const updated = await tx.studentAccount.update({
          where: { id: fd.accountId },
          data: { balance: { increment: payout } },
          select: { balance: true },
        });
        await tx.transaction.create({
          data: {
            accountId: fd.accountId,
            type: "fd_matured",
            amount: payout,
            balanceAfter: updated.balance,
            fixedDepositId: fd.id,
            note: `적금 만기 (원금 ${fd.principal} + 이자 ${interest})`,
            performedById: "system",
            performedByKind: "system",
          },
        });
        return true;
      });
      if (didProcess) processed += 1;
    } catch (e) {
      console.error("[fd-maturity]", fd.id, e);
    }
  }

  return NextResponse.json({ ok: true, scanned: mature.length, processed });
}
