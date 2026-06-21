import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeShareAccess } from "@/lib/share/share-auth";
import { announceEngagementChange } from "@/lib/realtime-broadcast";

const LikeSchema = z.object({
  shareToken: z.string().min(1),
  guestId: z.string().min(1).max(120),
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

  const where = {
    cardId_externalLikerKey: {
      cardId,
      externalLikerKey: parsed.guestId,
    },
  };
  const existing = await db.cardLike.findUnique({ where });
  if (existing) {
    await db.cardLike.delete({ where: { id: existing.id } });
    const [count, commentCount] = await Promise.all([
      db.cardLike.count({ where: { cardId } }),
      db.cardComment.count({ where: { cardId, deletedAt: null } }),
    ]);
    await announceEngagementChange(card.boardId, cardId, count, commentCount);
    return NextResponse.json({ liked: false, count });
  }

  await db.cardLike.create({
    data: {
      cardId,
      likerKind: "external",
      externalLikerKey: parsed.guestId,
    },
  });
  const [count, commentCount] = await Promise.all([
    db.cardLike.count({ where: { cardId } }),
    db.cardComment.count({ where: { cardId, deletedAt: null } }),
  ]);
  await announceEngagementChange(card.boardId, cardId, count, commentCount);
  return NextResponse.json({ liked: true, count });
}
