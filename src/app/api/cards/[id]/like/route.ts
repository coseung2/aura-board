import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCardAccess, getCurrentCardActor } from "@/lib/card-engagement-actor";

// card-comments-likes (2026-04-26): POST toggle like / GET state.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
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

  const isTeacher = actor.kind === "teacher";
  const where = isTeacher
    ? { cardId_likerUserId: { cardId, likerUserId: actor.id } }
    : { cardId_likerStudentId: { cardId, likerStudentId: actor.id } };

  const existing = await db.cardLike.findUnique({ where });
  if (existing) {
    await db.cardLike.delete({ where: { id: existing.id } });
    const count = await db.cardLike.count({ where: { cardId } });
    return NextResponse.json({ liked: false, count });
  }

  await db.cardLike.create({
    data: {
      cardId,
      likerKind: isTeacher ? "teacher" : "student",
      likerUserId: isTeacher ? actor.id : null,
      likerStudentId: !isTeacher ? actor.id : null,
    },
  });
  const count = await db.cardLike.count({ where: { cardId } });
  return NextResponse.json({ liked: true, count });
}
