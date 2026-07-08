import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";
import { sortSections } from "@/lib/sort-sections";

const BodySchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        order: z.number().int(),
        pinned: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
  // 보드 기본 출석번호 정렬 방향 (선택). "asc" | "desc" 만 허용.
  subjectOrder: z.enum(["asc", "desc"]).optional(),
});

/**
 * POST /api/boards/:id/sections/reorder
 *
 * columns 보드의 섹션 일괄 재정렬 + (선택) 보드 subjectOrder 갱신.
 * - order는 sortSections 규약(pinned asc / unpinned desc)에 맞게 호출자가 부여.
 * - boardId 스코프 안의 섹션만 허용. 그 외 id는 400.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await params;
    const body = BodySchema.parse(await req.json());
    const identities = await resolveIdentities();
    if (!identities.teacher) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await requirePermission(boardId, identities.teacher.userId, "edit");

    const ids = body.sections.map((s) => s.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      return NextResponse.json(
        { error: "duplicate_section_ids" },
        { status: 400 }
      );
    }

    const existing = await db.section.findMany({
      where: { id: { in: ids } },
      select: { id: true, boardId: true, pinned: true, order: true },
    });
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "section_not_found" },
        { status: 400 }
      );
    }
    const offenders = existing.filter((row) => row.boardId !== boardId);
    if (offenders.length > 0) {
      return NextResponse.json(
        { error: "section_board_mismatch" },
        { status: 400 }
      );
    }

    const pinnedAfter: { id: string; order: number; pinned: boolean }[] = [];
    const unpinnedAfter: { id: string; order: number; pinned: boolean }[] = [];
    for (const row of body.sections) {
      const pinned = row.pinned ?? false;
      if (pinned) {
        pinnedAfter.push({ id: row.id, order: row.order, pinned: true });
      } else {
        unpinnedAfter.push({ id: row.id, order: row.order, pinned: false });
      }
    }
    // sortSections 규약 검증: pinned 끼리는 order asc, unpinned 끼리는 order desc.
    for (let i = 1; i < pinnedAfter.length; i++) {
      if (pinnedAfter[i].order < pinnedAfter[i - 1].order) {
        return NextResponse.json(
          { error: "pinned_order_must_be_ascending" },
          { status: 400 }
        );
      }
    }
    for (let i = 1; i < unpinnedAfter.length; i++) {
      if (unpinnedAfter[i].order > unpinnedAfter[i - 1].order) {
        return NextResponse.json(
          { error: "unpinned_order_must_be_descending" },
          { status: 400 }
        );
      }
    }

    const data: Prisma.PrismaPromise<unknown>[] = body.sections.map((row) =>
      db.section.update({
        where: { id: row.id },
        data: { order: row.order, pinned: row.pinned ?? false },
        select: { id: true, order: true, pinned: true },
      })
    );
    if (body.subjectOrder !== undefined) {
      data.push(
        db.board.update({
          where: { id: boardId },
          data: { subjectOrder: body.subjectOrder },
        })
      );
    }
    const results = await db.$transaction(data);
    const sectionRows = results
      .filter(
        (r): r is { id: string; order: number; pinned: boolean } =>
          typeof r === "object" && r !== null && "pinned" in (r as object),
      )
      .map((r) => ({ id: r.id, order: r.order, pinned: r.pinned }))
      .sort(sortSections);

    await touchBoardUpdatedAt(boardId);
    await announceCardChange(boardId, "update");

    return NextResponse.json({
      sections: sectionRows,
      subjectOrder: body.subjectOrder ?? null,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? "invalid_body" },
        { status: 400 }
      );
    }
    console.error("[POST /api/boards/:id/sections/reorder]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
