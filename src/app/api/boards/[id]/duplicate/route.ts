import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const board = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        sections: { orderBy: { order: "asc" } },
        cards: true,
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    await requirePermission(board.id, user.id, "view");

    const slug = `${board.slug}-copy-${Date.now().toString(36)}`;

    const newBoard = await db.board.create({
      data: {
        title: board.title ? `${board.title} (복사본)` : "(복사본)",
        slug,
        layout: board.layout,
        description: board.description,
        classroomId: board.classroomId,
        thumbnailMode: board.thumbnailMode,
        members: {
          create: { userId: user.id, role: "owner" },
        },
        sections: {
          create: board.sections.map((s) => ({
            title: s.title,
            order: s.order,
          })),
        },
      },
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
