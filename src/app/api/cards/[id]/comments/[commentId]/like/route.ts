import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  applyCommentLikeMutation,
  getPrismaErrorCode,
} from "@/lib/comment-like-toggle";
import {
  authorizeCardAccess,
  getCurrentCardActor,
} from "@/lib/card-engagement-actor";

// Per-comment like intent. The explicit value makes retries idempotent; an
// omitted value retains the legacy toggle behavior for older callers.
const LikeIntentSchema = z.object({ liked: z.boolean().optional() }).passthrough();

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  {
    params,
  }: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id: cardId, commentId } = await params;
  const actor = await getCurrentCardActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (actor.kind === "parent") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const access = await authorizeCardAccess(cardId, actor, "write");
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const comment = await db.cardComment.findUnique({
    where: { id: commentId },
    select: { id: true, cardId: true, deletedAt: true },
  });
  if (!comment || comment.cardId !== cardId || comment.deletedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const intent = await readLikeIntent(req);
  if (!intent.ok) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  let liked: boolean;
  try {
    liked = await applyCommentLikeMutation(
      db.cardCommentLike,
      commentId,
      { kind: actor.kind, id: actor.id },
      intent.desiredLiked,
    );
  } catch (error) {
    const code = getPrismaErrorCode(error);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "card_comment_like_failed",
        route: "/api/cards/[id]/comments/[commentId]/like",
        cardId,
        commentId,
        actorKind: actor.kind,
        prismaCode: code,
      }),
    );
    if (code === "P2003") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "like_failed" }, { status: 500 });
  }

  const count = await db.cardCommentLike.count({ where: { commentId } });
  return NextResponse.json({ liked, count });
}
