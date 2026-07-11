/**
 * POST /api/breakout/assignments/[id]/copy-card (BR-4)
 *
 * Body: { sourceCardId: string }
 *
 * Explicit single-shot action — copies `sourceCardId` into EVERY group-copy
 * section of the assignment (excluding the teacher-pool section). No
 * background reference/link — the copies are independent rows (decisions Q6).
 *
 * Permission: board owner only (teacher).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { cloneStructure, TemplateStructure } from "@/lib/breakout";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";

const Body = z.object({
  sourceCardId: z.string().min(1),
});

function sharedSectionTitles(structure: TemplateStructure): Set<string> {
  const titles = new Set<string>();
  if (structure.sharedSections) {
    for (const row of structure.sharedSections) titles.add(row.title);
  }
  return titles;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await ctx.params;
    const user = await getCurrentUser();
    const body = await req.json();
    const input = Body.parse(body);

    const assignment = await db.breakoutAssignment.findUnique({
      where: { id: assignmentId },
      include: { template: true },
    });
    if (!assignment) {
      return NextResponse.json({ error: "assignment_not_found" }, { status: 404 });
    }

    // Teacher-only action — require owner role on the board.
    const role = await requirePermission(assignment.boardId, user.id, "edit");
    if (role !== "owner") {
      throw new ForbiddenError("Only the board owner can bulk-copy cards");
    }

    const sourceCard = await db.card.findUnique({
      where: { id: input.sourceCardId },
      include: {
        // multi-attachment (2026-04-20): 복제 시 첨부도 함께 이관.
        attachments: {
          orderBy: { order: "asc" },
          select: {
            kind: true,
            url: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            order: true,
          },
        },
      },
    });
    if (!sourceCard || sourceCard.boardId !== assignment.boardId) {
      return NextResponse.json({ error: "card_not_found" }, { status: 404 });
    }

    // Identify teacher-pool sections by title match against the template's
    // sharedSections spec (set at creation time; decisions Q6 permits this
    // because templates never retroactively mutate boards).
    const structure = cloneStructure(assignment.template.structure);
    const poolTitles = sharedSectionTitles(structure);

    const allSections = await db.section.findMany({
      where: { boardId: assignment.boardId },
      select: { id: true, title: true },
    });
    const groupSectionIds = allSections
      .filter((section) => !poolTitles.has(section.title))
      .map((section) => section.id);

    if (groupSectionIds.length === 0) {
      return NextResponse.json({ error: "no_group_sections" }, { status: 400 });
    }

    const createdCards = await db.$transaction(async (tx) => {
      const cards = [] as Array<
        Awaited<ReturnType<typeof tx.card.create>> & {
          attachments: Awaited<ReturnType<typeof tx.cardAttachment.findMany>>;
        }
      >;
      for (const sectionId of groupSectionIds) {
        // Skip the source section to avoid duplicating into the origin.
        if (sectionId === sourceCard.sectionId) continue;
        const maxOrder = await tx.card.aggregate({
          where: { sectionId },
          _max: { order: true },
        });
        const card = await tx.card.create({
          data: {
            boardId: assignment.boardId,
            sectionId,
            authorId: user.id,
            title: sourceCard.title,
            content: sourceCard.content,
            color: sourceCard.color,
            // 레거시 singleton 필드는 source에 있으면 유지(하위 호환).
            imageUrl: sourceCard.imageUrl,
            linkUrl: sourceCard.linkUrl,
            linkTitle: sourceCard.linkTitle,
            linkDesc: sourceCard.linkDesc,
            linkImage: sourceCard.linkImage,
            videoUrl: sourceCard.videoUrl,
            fileUrl: sourceCard.fileUrl,
            fileName: sourceCard.fileName,
            fileSize: sourceCard.fileSize,
            fileMimeType: sourceCard.fileMimeType,
            x: 0,
            y: 0,
            width: sourceCard.width,
            height: sourceCard.height,
            order: (maxOrder._max.order ?? -1) + 1,
          },
        });
        // multi-attachment: 첨부 배열 복제. createMany로 벌크 삽입.
        if (sourceCard.attachments.length > 0) {
          await tx.cardAttachment.createMany({
            data: sourceCard.attachments.map((attachment) => ({
              cardId: card.id,
              kind: attachment.kind,
              url: attachment.url,
              fileName: attachment.fileName,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              order: attachment.order,
            })),
          });
        }
        const newAttachments = await tx.cardAttachment.findMany({
          where: { cardId: card.id },
          orderBy: { order: "asc" },
        });
        cards.push({ ...card, attachments: newAttachments });
      }
      return cards;
    });

    // classroom-boards-tab "🟢 새 활동" 배지 — 벌크 복사로 카드 다수 생성 → touch.
    await touchBoardUpdatedAt(assignment.boardId);
    await announceCardChange(assignment.boardId, "insert");

    return NextResponse.json({
      copiedTo: createdCards.length,
      cards: createdCards.map((card) => ({
        ...card,
        attachments: card.attachments.map((attachment) => ({
          id: attachment.id,
          kind: attachment.kind,
          url: attachment.url,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          order: attachment.order,
        })),
      })),
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[POST /api/breakout/assignments/[id]/copy-card]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
