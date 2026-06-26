import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import {
  cloneTeacherBoard,
  SUPPORTED_CLONE_LAYOUTS,
  type BoardCloneSource,
} from "@/lib/boards/clone";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const board = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        sections: { orderBy: { order: "asc" } },
        cards: {
          orderBy: { order: "asc" },
          include: { authors: true },
        },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    await requirePermission(board.id, user.id, "view");

    if (!SUPPORTED_CLONE_LAYOUTS.has(board.layout)) {
      return NextResponse.json(
        { error: "unsupported_layout" },
        { status: 400 },
      );
    }

    // The source row carries every scalar we need. The Prisma `select` for
    // board-by-id-or-slug already returned sections and cards-with-authors,
    // which is the exact surface cloneTeacherBoard expects.
    const source: BoardCloneSource = board;

    const newBoard = await db.$transaction(async (tx) => {
      return cloneTeacherBoard(tx, source, user.id);
    });

    return NextResponse.json({ board: newBoard });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[POST /api/boards/:id/duplicate]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
