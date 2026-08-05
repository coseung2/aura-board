import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SUPPORTED_CLONE_LAYOUTS } from "@/lib/boards/clone";

const PublishSchema = z.object({ published: z.boolean() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = PublishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { id } = await params;
  const board = await db.board.findFirst({
    where: {
      id,
      systemGameKind: null,
      members: { some: { userId: user.id, role: "owner" } },
    },
    select: { id: true, layout: true },
  });

  if (!board) {
    return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  }
  if (!SUPPORTED_CLONE_LAYOUTS.has(board.layout)) {
    return NextResponse.json({ error: "unsupported_layout" }, { status: 400 });
  }

  const updated = await db.board.update({
    where: { id: board.id },
    data: {
      communityPublishedAt: parsed.data.published ? new Date() : null,
    },
    select: { id: true, communityPublishedAt: true },
  });

  return NextResponse.json({
    board: {
      id: updated.id,
      publishedAt: updated.communityPublishedAt?.toISOString() ?? null,
    },
  });
}
