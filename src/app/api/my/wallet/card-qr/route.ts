import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureAccountFor } from "@/lib/bank";
import { issueCardToken } from "@/lib/qr-token";

// GET /api/my/wallet/card-qr
// Returns the fixed payment card token for the logged-in student's card.
export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { cardId } = await ensureAccountFor({
    id: student.id,
    classroomId: student.classroomId,
  });
  const card = await db.studentCard.findUnique({
    where: { id: cardId },
    select: { id: true, qrSecret: true, status: true },
  });
  if (!card || card.status !== "active") {
    return NextResponse.json(
      { error: "카드가 활성 상태가 아닙니다" },
      { status: 400 }
    );
  }
  const { token, expiresAt } = issueCardToken(card.id, card.qrSecret);
  return NextResponse.json({ token, expiresAt });
}
