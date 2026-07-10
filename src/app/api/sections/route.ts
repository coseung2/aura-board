import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";

const CreateSectionSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    const body = await req.json();
    const input = CreateSectionSchema.parse(body);
    await requirePermission(input.boardId, user.id, "edit");

    const pinnedCount = await db.section.count({
      where: { boardId: input.boardId, pinned: true },
    });

    const section = await db.section.create({
      data: {
        boardId: input.boardId,
        title: input.title,
        order: pinnedCount,
      },
    });

    // classroom-boards-tab "🟢 새 활동" 배지 — 섹션 생성도 구조적 활동 → touch.
    await touchBoardUpdatedAt(input.boardId, {
      action: "section.created",
      actorType: "teacher",
      actorId: user.id,
    });
    await announceCardChange(input.boardId, "update");

    return NextResponse.json({ section });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[POST /api/sections]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
