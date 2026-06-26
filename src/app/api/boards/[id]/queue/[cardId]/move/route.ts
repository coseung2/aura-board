import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { resolveCardAuthorLabels } from "@/lib/card-author-labels";
import { announceQueueChange } from "@/lib/realtime-broadcast";

const MoveBody = z.object({
  order: z.number().int().min(0),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  const { id: boardIdOrSlug, cardId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = MoveBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "order 필수" }, { status: 400 });
  }

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true, anonymousAuthor: true },
  });
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card || card.boardId !== board.id || card.queueStatus === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // "insert at order N" 의미론: 기존에 order >= N 인 큐 카드를 +1 밀어낸 뒤
  // 이동 대상 카드를 order=N 으로 세팅. 같은 order 충돌 방지 (이전 구현은
  // 단순 덮어쓰기라 두 카드가 동일 order 를 갖게 돼 sort 가 결정적이지 않았음).
  const [, updated] = await db.$transaction([
    db.card.updateMany({
      where: {
        boardId: board.id,
        id: { not: cardId },
        queueStatus: { not: null },
        order: { gte: parsed.data.order },
      },
      data: { order: { increment: 1 } },
    }),
    db.card.update({
      where: { id: cardId },
      data: { order: parsed.data.order },
    }),
  ]);

  // classroom-boards-tab "🟢 새 활동" 배지 — 큐 순서 변경도 활동 신호.
  await touchBoardUpdatedAt(board.id);
  void announceQueueChange(board.id, cardId, "move");
  const authorLabels = await resolveCardAuthorLabels(updated);

  return NextResponse.json({
    card: {
      ...updated,
      ...authorLabels,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      anonymousAuthor: board.anonymousAuthor,
    },
  });
}
