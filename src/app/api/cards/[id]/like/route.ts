import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { applyCardLikeMutation, getPrismaErrorCode } from "@/lib/card-like-toggle";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";
import { announceEngagementChange } from "@/lib/realtime-broadcast";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

// card-comments-likes (2026-04-26): POST toggle like / GET state.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LikeIntentSchema = z.object({ liked: z.boolean().optional() }).passthrough();

async function readLikeIntent(req: Request): Promise<
  | { ok: true; desiredLiked: boolean | undefined }
  | { ok: false }
> {
  const text = await req.text().catch(() => "");
  if (!text.trim()) return { ok: true, desiredLiked: undefined };

  try {
    const parsed = LikeIntentSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false };
    return { ok: true, desiredLiked: parsed.data.liked };
  } catch {
    return { ok: false };
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (actor.kind === "parent") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const access = await authorizeCardAccess(cardId, actor, "write");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const intent = await readLikeIntent(req);
  if (!intent.ok) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { boardId: true },
  });

  let liked: boolean;
  try {
    liked = await applyCardLikeMutation(
      db.cardLike,
      cardId,
      { kind: actor.kind, id: actor.id },
      intent.desiredLiked,
    );
  } catch (error) {
    const code = getPrismaErrorCode(error);
    console.error(JSON.stringify({
      level: "error",
      msg: "card_like_failed",
      route: "/api/cards/[id]/like",
      cardId,
      actorKind: actor.kind,
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
  if (card) {
    await touchBoardUpdatedAt(card.boardId, {
      action: liked ? "like.created" : "like.deleted",
      actorType: actor.kind === "teacher" ? "teacher" : "student",
      actorId: actor.id,
    });
    await announceEngagementChange(
      card.boardId,
      cardId,
      count,
      commentCount,
      "like",
    );
  }
  return NextResponse.json({ liked, count });
}
