/**
 * POST /api/share/cards — Create a card via share link (student permission).
 *
 * Body: { shareToken, boardId, title, content?, color?, sectionId?, authorName }
 *
 * Validates shareToken + boardId + student share permission.
 * Creates card with externalAuthorName = authorName (no user/student link).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeShareAccess } from "@/lib/share/share-auth";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

const CardSchema = z.object({
  shareToken: z.string().min(1),
  boardId: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().max(5000).default(""),
  color: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  authorName: z.string().min(1).max(60),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof CardSchema>;
  try {
    const raw = await req.json();
    parsed = CardSchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Verify share access.
  const auth = await authorizeShareAccess(parsed.shareToken, "student");
  if (!auth.ok) {
    const status = auth.reason === "not_found" ? 404 : 403;
    return NextResponse.json({ error: auth.reason }, { status });
  }

  // Verify boardId matches
  if (auth.boardId !== parsed.boardId) {
    return NextResponse.json({ error: "board_mismatch" }, { status: 403 });
  }

  // Verify sectionId if provided
  if (parsed.sectionId) {
    const section = await db.section.findUnique({
      where: { id: parsed.sectionId },
      select: { boardId: true },
    });
    if (!section || section.boardId !== parsed.boardId) {
      return NextResponse.json({ error: "invalid_section" }, { status: 400 });
    }
  }

  // Create the card
  const card = await db.card.create({
    data: {
      boardId: parsed.boardId,
      title: parsed.title,
      content: parsed.content,
      color: parsed.color ?? null,
      sectionId: parsed.sectionId ?? null,
      externalAuthorName: parsed.authorName,
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      order: 0,
    },
  });

  await touchBoardUpdatedAt(parsed.boardId);

  return NextResponse.json({
    ok: true,
    card: {
      id: card.id,
      title: card.title,
      content: card.content,
      color: card.color,
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
      order: card.order,
      sectionId: card.sectionId,
      externalAuthorName: card.externalAuthorName,
      createdAt: card.createdAt.toISOString(),
    },
  });
}
