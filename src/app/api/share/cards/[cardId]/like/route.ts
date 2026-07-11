import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { applyCardLikeMutation, getPrismaErrorCode } from "@/lib/card-like-toggle";
import { authorizeShareAccess } from "@/lib/share/share-auth";
import { announceEngagementChange } from "@/lib/realtime-broadcast";

const LikeSchema = z.object({
  shareToken: z.string().min(1),
  guestId: z.string().min(1).max(120),
  liked: z.boolean().optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  let parsed: z.infer<typeof LikeSchema>;
  try {
    parsed = LikeSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, boardId: true },
  });
  if (!card) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authorizeShareAccess(parsed.shareToken, "student");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason },
      { status: auth.reason === "not_found" ? 404 : 403 }
    );
  }
  if (auth.boardId !== card.boardId) {
    return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
  }

  let liked: boolean;
  try {
    liked = await applyCardLikeMutation(
      db.cardLike,
      cardId,
      { kind: "external", id: parsed.guestId },
      parsed.liked,
    );
  } catch (error) {
    const code = getPrismaErrorCode(error);
    console.error(JSON.stringify({
      level: "error",
      msg: "share_card_like_failed",
      route: "/api/share/cards/[cardId]/like",
      cardId,
      prismaCode: code,
    }));
    if (code === "P2003") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "like_failed" }, { status: 500 });
  }

  const [count, commentCount] = await Promise.all([
    db.cardLike.count({ where: { cardId } }),
    db.cardComment.count({ where: { cardId, deletedAt: null } }),
  ]);
  await announceEngagementChange(
    card.boardId,
    cardId,
    count,
    commentCount,
    "like",
  );
  return NextResponse.json({ liked, count });
}
