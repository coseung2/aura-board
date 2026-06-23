/**
 * /api/boards/[id]/aura/evaluations
 *
 * Aura 평가 모드 (2026-06-23) — 보드의 카드별 등급 캐시 목록 조회.
 *
 *   GET — teacher owner/editor 만. 보드의 모든 CardEvaluation 을
 *         { cardId, studentId, level, comment, aiFeedbackId, updatedAt }
 *         배열로 반환. Aura 측은 보지 않는다 (Aura 는 AiFeedback 만 본다).
 *         보드 설정 UI 가 "어떤 카드가 이미 평가됐는지" 를 한 번에 그릴 때
 *         사용.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardIdOrSlug } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await requirePermission(board.id, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  const rows = await db.cardEvaluation.findMany({
    where: { boardId: board.id },
    orderBy: { updatedAt: "desc" },
    select: {
      cardId: true,
      studentId: true,
      level: true,
      comment: true,
      aiFeedbackId: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    evaluations: rows.map((r) => ({
      cardId: r.cardId,
      studentId: r.studentId,
      level: r.level,
      comment: r.comment,
      aiFeedbackId: r.aiFeedbackId,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}