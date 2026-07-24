import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";
import { announceEngagementChange } from "@/lib/realtime-broadcast";

// card-comments-likes (2026-04-26): DELETE comment (own + teacher 모더레이션).
// soft-delete (deletedAt) — 카드 삭제 시 cascade.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id: cardId, commentId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await authorizeCardAccess(cardId, actor, "write");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const comment = await db.cardComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      cardId: true,
      audience: true,
      authorKind: true,
      authorUserId: true,
      authorStudentId: true,
      authorParentId: true,
      deletedAt: true,
    },
  });
  if (!comment || comment.cardId !== cardId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (comment.audience === "guardian" && !access.ctx.guardianAvailable) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (comment.deletedAt) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  // 본인 댓글이거나 학급 교사면 삭제 가능
  const isOwn =
    (actor.kind === "teacher" && comment.authorUserId === actor.id) ||
    (actor.kind === "student" && comment.authorStudentId === actor.id) ||
    (actor.kind === "parent" &&
      comment.audience === "guardian" &&
      comment.authorParentId === actor.id);
  const isTeacherModerator = actor.kind === "teacher"; // 학급 게이트는 authorize 가 이미 통과
  if (!isOwn && !isTeacherModerator) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.cardComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  if (comment.audience === "public") {
    try {
      const [likeCount, commentCount, card] = await Promise.all([
        db.cardLike.count({ where: { cardId } }),
        db.cardComment.count({ where: { cardId, audience: "public", deletedAt: null } }),
        db.card.findUnique({ where: { id: cardId }, select: { boardId: true } }),
      ]);
      if (card) {
        await announceEngagementChange(
          card.boardId,
          cardId,
          likeCount,
          commentCount,
          "comment",
        );
      }
    } catch {
      // Broadcast side-effects are non-fatal.
    }
  }

  return NextResponse.json({ ok: true });
}
