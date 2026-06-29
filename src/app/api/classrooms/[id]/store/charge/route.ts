import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { getCardIdFromToken, verifyCardToken } from "@/lib/qr-token";

const Body = z.object({
  cardQrToken: z.string().min(1),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.number().int().positive(),
      })
    )
    .min(1)
    .max(30),
});

// POST /api/classrooms/:id/store/charge
// Cashier (store-clerk or teacher) scans student card QR, submits cart.
// Atomic: token verify → balance check → cart fetch → balance decrement +
// stock decrement + Transaction.
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
    return NextResponse.json({ error: "결제 요청 형식 확인" }, { status: 400 });
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
    "store.charge"
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1) Verify card token
  const cardId = getCardIdFromToken(parsed.data.cardQrToken);
  if (!cardId) {
    return NextResponse.json(
      { error: "유효하지 않은 카드 QR" },
      { status: 400 }
    );
  }
  const card = await db.studentCard.findUnique({
    where: { id: cardId },
    include: {
      account: {
        include: {
          student: { select: { id: true, name: true, number: true } },
        },
      },
    },
  });
  if (!card || card.status !== "active") {
    return NextResponse.json(
      { error: "카드가 존재하지 않거나 정지 상태입니다" },
      { status: 400 }
    );
  }
  if (card.account.classroomId !== classroomId) {
    return NextResponse.json(
      { error: "다른 학급 카드입니다" },
      { status: 400 }
    );
  }

  const verified = verifyCardToken(parsed.data.cardQrToken, card.qrSecret);
  if (!verified) {
    return NextResponse.json(
      { error: "만료되었거나 위조된 QR 토큰입니다" },
      { status: 400 }
    );
  }

  const performerId = user?.id ?? student?.id ?? "system";
  const performerKind = user ? "teacher" : "store-clerk";

  // 2) Load items
  const itemIds = parsed.data.items.map((i) => i.itemId);
  const items = await db.storeItem.findMany({
    where: { id: { in: itemIds }, classroomId, archived: false },
  });
  if (items.length !== itemIds.length) {
    return NextResponse.json(
      { error: "판매 종료되었거나 존재하지 않는 상품이 포함되어 있습니다" },
      { status: 400 }
    );
  }
  const qtyByItem = new Map(parsed.data.items.map((i) => [i.itemId, i.qty]));

  // 3) Stock check + total calculation
  for (const it of items) {
    const q = qtyByItem.get(it.id)!;
    if (it.stock !== null && it.stock < q) {
      return NextResponse.json(
        { error: `${it.name} 재고 부족 (재고 ${it.stock}개)` },
        { status: 400 }
      );
    }
  }
  const total = items.reduce(
    (sum, it) => sum + it.price * (qtyByItem.get(it.id) ?? 0),
    0
  );
  if (total <= 0) {
    return NextResponse.json({ error: "총액이 0이거나 음수" }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // Balance lock-and-check
      const acc = await tx.studentAccount.findUnique({
        where: { id: card.accountId },
        select: { id: true, balance: true },
      });
      if (!acc) throw new Error("account_missing");
      if (acc.balance < total) throw new Error("insufficient_balance");

      const updated = await tx.studentAccount.update({
        where: { id: acc.id },
        data: { balance: { decrement: total } },
        select: { balance: true },
      });

      // Decrement stock (non-null only)
      for (const it of items) {
        if (it.stock !== null) {
          await tx.storeItem.update({
            where: { id: it.id },
            data: { stock: { decrement: qtyByItem.get(it.id)! } },
          });
        }
      }

      // Single Transaction record for the whole charge (note serializes items)
      const note = items
        .map((it) => `${it.name} ${qtyByItem.get(it.id)}개`)
        .join(", ");
      const trx = await tx.transaction.create({
        data: {
          accountId: acc.id,
          type: "purchase",
          amount: total,
          balanceAfter: updated.balance,
          note,
          // Reference the first item (Transaction has single FK — primary item)
          storeItemId: items[0].id,
          performedById: performerId,
          performedByKind: performerKind,
        },
      });

      return {
        balance: updated.balance,
        transactionId: trx.id,
        total,
        student: card.account.student,
        items: items.map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          qty: qtyByItem.get(it.id)!,
        })),
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "insufficient_balance") {
      return NextResponse.json(
        { error: "잔액 부족" },
        { status: 400 }
      );
    }
    throw err;
  }
}
