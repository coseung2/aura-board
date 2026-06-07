import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeShareAccess } from "@/lib/share/share-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const shareToken = req.headers.get("x-share-token");
  const guestId = req.headers.get("x-share-guest-id");

  if (!shareToken) {
    return NextResponse.json({ error: "token_required" }, { status: 401 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, boardId: true, board: { select: { anonymousAuthor: true } } },
  });
  if (!card) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authorizeShareAccess(shareToken, "student");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason },
      { status: auth.reason === "not_found" ? 404 : 403 }
    );
  }
  if (auth.boardId !== card.boardId) {
    return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
  }

  const [likeCount, commentCount, myLike] = await Promise.all([
    db.cardLike.count({ where: { cardId } }),
    db.cardComment.count({ where: { cardId, deletedAt: null } }),
    guestId
      ? db.cardLike.findUnique({
          where: { cardId_externalLikerKey: { cardId, externalLikerKey: guestId } },
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    likeCount,
    commentCount,
    isLiked: Boolean(myLike),
    canInteract: Boolean(guestId),
    anonymousAuthor: card.board.anonymousAuthor,
  });
}
