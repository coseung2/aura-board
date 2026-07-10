import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";
import { formatEngagementAuthor } from "@/lib/card-engagement-format";
import { announceEngagementChange } from "@/lib/realtime-broadcast";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

// card-comments-likes (2026-04-26): GET list / POST create.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateSchema = z.object({
  content: z.string().min(1).max(1000),
});

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

  const rows = await db.cardComment.findMany({
    where: { cardId, deletedAt: null },
    // comments-newest-first (2026-04-26): 최근 댓글이 상단.
    orderBy: { createdAt: "desc" },
    include: {
      authorUser: { select: { id: true, name: true } },
      authorStudent: { select: { id: true, name: true } },
    },
  });

  const items = rows.map((r) => {
    const isTeacher = r.authorKind === "teacher";
    const rawName = isTeacher ? r.authorUser?.name ?? "" : r.authorStudent?.name ?? "";
    const authorId = isTeacher ? r.authorUser?.id ?? null : r.authorStudent?.id ?? null;
    const ownByMe =
      authorId !== null &&
      ((isTeacher && actor.kind === "teacher" && actor.id === authorId) ||
        (!isTeacher && actor.kind === "student" && actor.id === authorId));
    return {
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      authorKind: r.authorKind,
      authorLabel: formatEngagementAuthor({
        kind: r.authorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: ownByMe || actor.kind === "teacher",
    };
  });

  return NextResponse.json({ items });
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const isTeacher = actor.kind === "teacher";
  const created = await db.cardComment.create({
    data: {
      cardId,
      authorKind: isTeacher ? "teacher" : "student",
      authorUserId: isTeacher ? actor.id : null,
      authorStudentId: !isTeacher ? actor.id : null,
      content: parsed.data.content,
    },
    include: {
      authorUser: { select: { id: true, name: true } },
      authorStudent: { select: { id: true, name: true } },
    },
  });

  try {
    const [likeCount, commentCount, card] = await Promise.all([
      db.cardLike.count({ where: { cardId } }),
      db.cardComment.count({ where: { cardId, deletedAt: null } }),
      db.card.findUnique({ where: { id: cardId }, select: { boardId: true } }),
    ]);
    if (card) {
      await touchBoardUpdatedAt(card.boardId, {
        action: "comment.created",
        actorType: isTeacher ? "teacher" : "student",
        actorId: actor.id,
      });
      await announceEngagementChange(card.boardId, cardId, likeCount, commentCount);
    }
  } catch {
    // Broadcast side-effects are non-fatal.
  }

  const rawName = isTeacher ? created.authorUser?.name ?? "" : created.authorStudent?.name ?? "";
  return NextResponse.json({
    item: {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
      authorKind: created.authorKind,
      authorLabel: formatEngagementAuthor({
        kind: created.authorKind,
        name: rawName,
        anonymous: access.ctx.anonymousAuthor,
      }),
      canDelete: true,
    },
  });
}
