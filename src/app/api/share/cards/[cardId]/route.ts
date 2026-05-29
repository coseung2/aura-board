/**
 * PATCH /api/share/cards/[cardId] — Update card via share link (edit mode).
 * DELETE /api/share/cards/[cardId] — Delete card via share link (edit mode).
 *
 * Body (PATCH): { shareToken, title?, content?, color? }
 * Body (DELETE): { shareToken }
 *
 * Only allows editing cards created by the same authorName (externalAuthorName match).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeShareAccess } from "@/lib/share/share-auth";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

const PatchSchema = z.object({
  shareToken: z.string().min(1),
  authorName: z.string().min(1).max(60),
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(5000).optional(),
  color: z.string().nullable().optional(),
});

const DeleteSchema = z.object({
  shareToken: z.string().min(1),
  authorName: z.string().min(1).max(60),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  let parsed: z.infer<typeof PatchSchema>;
  try {
    const raw = await req.json();
    parsed = PatchSchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, boardId: true, externalAuthorName: true },
  });
  if (!card) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Verify share access (edit required)
  const auth = await authorizeShareAccess(parsed.shareToken, "edit");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === "not_found" ? 404 : 403 });
  }
  if (auth.boardId !== card.boardId) {
    return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
  }

  // Only the original author can edit
  if (card.externalAuthorName !== parsed.authorName) {
    return NextResponse.json({ error: "not_your_card" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.title !== undefined) data.title = parsed.title;
  if (parsed.content !== undefined) data.content = parsed.content;
  if (parsed.color !== undefined) data.color = parsed.color;

  const updated = await db.card.update({ where: { id: cardId }, data });
  await touchBoardUpdatedAt(card.boardId);

  return NextResponse.json({ ok: true, card: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  let parsed: z.infer<typeof DeleteSchema>;
  try {
    const raw = await req.json();
    parsed = DeleteSchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, boardId: true, externalAuthorName: true },
  });
  if (!card) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await authorizeShareAccess(parsed.shareToken, "edit");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.reason === "not_found" ? 404 : 403 });
  }
  if (auth.boardId !== card.boardId) {
    return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
  }

  // Only the original author can delete
  if (card.externalAuthorName !== parsed.authorName) {
    return NextResponse.json({ error: "not_your_card" }, { status: 403 });
  }

  await db.card.delete({ where: { id: cardId } });
  await touchBoardUpdatedAt(card.boardId);

  return NextResponse.json({ ok: true });
}
