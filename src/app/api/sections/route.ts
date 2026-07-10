import { revalidatePath } from "next/cache";
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
    // 즉시 새로고침해도 이전 RSC payload가 재사용되지 않도록 다음 방문을
    // 재검증하고, 열려 있는 다른 보드 화면에는 snapshot 갱신을 알린다.
    revalidatePath("/board/[id]", "page");
    await announceCardChange(input.boardId, "update");

    return NextResponse.json({ section });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/sections]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
