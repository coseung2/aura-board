import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { applyCardLikeMutation, getPrismaErrorCode } from "@/lib/card-like-toggle";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";
import { scheduleBoardActivity } from "@/lib/board-activity-queue";
import { scheduleEngagementBroadcast } from "@/lib/engagement-broadcast-queue";
import { updateBoardViewerLikeCache } from "@/lib/board-viewer-like-cache";

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

  const access = await authorizeCardAccess(cardId, actor, "write");
  if (!access.ok) {
    return NextResponse.json({ error: access.reason }, { status: access.reason === "not_found" ? 404 : 403 });
  }

  const intent = await readLikeIntent(req);
  if (!intent.ok) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

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

  const count = await db.cardLike.count({ where: { cardId } });
  if (actor.kind === "teacher" || actor.kind === "student") {
    updateBoardViewerLikeCache(
      access.ctx.boardId,
      { kind: actor.kind, id: actor.id },
      cardId,
      liked,
    );
  }
  scheduleBoardActivity(access.ctx.boardId, {
    action: liked ? "like.created" : "like.deleted",
    actorType:
      actor.kind === "teacher"
        ? "teacher"
        : actor.kind === "student"
          ? "student"
          : "guest",
    actorId: actor.id,
    coalesceMs: 1_000,
  });
  scheduleEngagementBroadcast(access.ctx.boardId, cardId, "like");
  return NextResponse.json({ liked, count });
}
