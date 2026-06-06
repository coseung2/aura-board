import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";

const PatchBoardSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  classroomId: z.string().nullable().optional(),
  // card-comments-likes (2026-04-26)
  anonymousAuthor: z.boolean().optional(),
  boardTheme: z
    .enum([
      "pastel-peach",
      "pastel-mint",
      "pastel-sky",
      "pastel-lilac",
      "pastel-lemon",
    ])
    .optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const board = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        cards: { orderBy: { createdAt: "asc" } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const role = await requirePermission(board.id, user.id, "view");

    return NextResponse.json({
      board: { id: board.id, slug: board.slug, title: board.title },
      cards: board.cards,
      members: board.members,
      currentUser: { id: user.id, name: user.name, role },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[GET /api/boards/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const board = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        cards: { include: { attachments: true } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    await requirePermission(board.id, user.id, "delete_any");

    const blobUrls = [
      board.eventPosterUrl,
      ...board.cards.flatMap((card) => [
        card.imageUrl,
        card.thumbUrl,
        card.linkImage,
        card.videoUrl,
        card.fileUrl,
        ...card.attachments.flatMap((a) => [a.url, a.previewUrl]),
      ]),
    ];

    await db.board.delete({ where: { id: board.id } });
    await enqueueBlobDeletion(blobUrls, "board.delete", "Board", board.id);

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[DELETE /api/boards/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const board = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    await requirePermission(board.id, user.id, "edit");

    const body = await req.json();
    const input = PatchBoardSchema.parse(body);
    const updated = await db.board.update({ where: { id: board.id }, data: input });

    return NextResponse.json({ board: updated });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/boards/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
