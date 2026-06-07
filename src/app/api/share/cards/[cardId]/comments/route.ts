/**
 * GET/POST /api/share/cards/[cardId]/comments — Comments via share link.
 *
 * GET:  header { x-share-token } → returns comment list.
 * POST: body { shareToken, content, authorName } → creates comment.
 *
 * Requires the unified student share permission.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeShareAccess } from "@/lib/share/share-auth";
import { formatEngagementAuthor } from "@/lib/card-engagement-format";

const PostSchema = z.object({
  shareToken: z.string().min(1),
  content: z.string().min(1).max(1000),
  authorName: z.string().min(1).max(60),
});

/** Extract share token from header (GET) or body (POST) */
async function resolveShareAccess(
  req: Request,
  cardId: string
) {
  // Try header first (GET), then fall back
  const headerToken = req.headers.get("x-share-token");

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, boardId: true },
  });
  if (!card) return { error: "not_found", status: 404 } as const;

  if (headerToken) {
    const auth = await authorizeShareAccess(headerToken, "student");
    if (!auth.ok) {
      return { error: auth.reason, status: auth.reason === "not_found" ? 404 : 403 } as const;
    }
    if (auth.boardId !== card.boardId) {
      return { error: "board_mismatch", status: 403 } as const;
    }
    return { boardId: card.boardId } as const;
  }

  return { error: "token_required", status: 401 } as const;
}

// ─── GET: 댓글 목록 ───
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  const access = await resolveShareAccess(req, cardId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.cardComment.findMany({
    where: { cardId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      createdAt: true,
      authorKind: true,
      externalAuthorName: true,
    },
  });

  const items = rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    authorKind: r.authorKind,
    authorLabel:
      r.authorKind === "external"
        ? r.externalAuthorName ?? "익명"
        : formatEngagementAuthor({
            kind: r.authorKind as "teacher" | "student",
            name: r.externalAuthorName ?? "",
            anonymous: false,
          }),
    canDelete: false,
  }));

  return NextResponse.json({ items });
}

// ─── POST: 댓글 작성 ───
export async function POST(
  req: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  let parsed: z.infer<typeof PostSchema>;
  try {
    const raw = await req.json();
    parsed = PostSchema.parse(raw);
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

  const comment = await db.cardComment.create({
    data: {
      cardId: card.id,
      authorKind: "external",
      externalAuthorName: parsed.authorName,
      content: parsed.content,
    },
  });

  return NextResponse.json({
    ok: true,
    item: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      authorKind: "external",
      authorLabel: parsed.authorName,
      canDelete: false,
    },
    comment: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      authorKind: "external",
      authorLabel: parsed.authorName,
      canDelete: false,
    },
  });
}
