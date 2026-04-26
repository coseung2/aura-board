import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";

// card-comments-likes (2026-04-26): GET 카드별 통합 engagement 상태
// (likeCount, commentCount, isLiked, canInteract).
// 보드 inline 카드의 chips 가 fetch 1회로 카운트 + 본인 좋아요 상태 채움.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await authorizeCardAccess(cardId, actor, "read");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const [likeCount, commentCount, myLike] = await Promise.all([
    db.cardLike.count({ where: { cardId } }),
    db.cardComment.count({ where: { cardId, deletedAt: null } }),
    actor.kind === "teacher"
      ? db.cardLike.findUnique({ where: { cardId_likerUserId: { cardId, likerUserId: actor.id } } })
      : actor.kind === "student"
      ? db.cardLike.findUnique({ where: { cardId_likerStudentId: { cardId, likerStudentId: actor.id } } })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    likeCount,
    commentCount,
    isLiked: Boolean(myLike),
    canInteract: actor.kind !== "parent",
    anonymousAuthor: access.ctx.anonymousAuthor,
  });
}
