import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { resolveIdentities } from "@/lib/identity";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceCardChange } from "@/lib/realtime-broadcast";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";
import { STREAM_ACTIVITY_TEMPLATES } from "@/lib/stream-activity-templates";

const SortModeSchema = z.enum(["manual", "newest", "oldest", "title"]);
const ActivityTemplateSchema = z.enum(STREAM_ACTIVITY_TEMPLATES);

const PatchSectionSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  order: z.number().int().nonnegative().optional(),
  sortMode: SortModeSchema.nullable().optional(),
  pinned: z.boolean().optional(),
  activityTemplate: ActivityTemplateSchema.nullable().optional(),
  activityTemplateState: z
    .object({
      wordCloudPublished: z.boolean().optional(),
      activityTemplateOrder: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const section = await db.section.findUnique({
      where: { id },
      include: { board: { select: { classroomId: true } } },
    });
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    const body = await req.json();
    const input = PatchSectionSchema.parse(body);
    const identities = await resolveIdentities();
    const inputKeys = Object.keys(input);
    const isStudentTemplateOrderPatch =
      inputKeys.length === 1 &&
      input.activityTemplateState !== undefined &&
      input.activityTemplateState !== null &&
      typeof input.activityTemplateState.activityTemplateOrder === "number";
    const studentCanReorder =
      isStudentTemplateOrderPatch &&
      !!identities.student &&
      !!section.board.classroomId &&
      section.board.classroomId === identities.student.classroomId;

    if (!studentCanReorder) {
      if (!identities.teacher) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await requirePermission(section.boardId, identities.teacher.userId, "edit");
    }

    const existingActivityTemplateState =
      section.activityTemplateState &&
      typeof section.activityTemplateState === "object" &&
      !Array.isArray(section.activityTemplateState)
        ? (section.activityTemplateState as Record<string, unknown>)
        : {};

    const data = {
      ...input,
      activityTemplateState:
        studentCanReorder && input.activityTemplateState
          ? {
              ...existingActivityTemplateState,
              activityTemplateOrder: input.activityTemplateState.activityTemplateOrder,
            }
          :
        input.activityTemplate === null || input.activityTemplateState === null
          ? Prisma.DbNull
          : input.activityTemplateState,
    };

    const updated = await db.section.update({
      where: { id },
      data,
    });

    await touchBoardUpdatedAt(section.boardId);
    await announceCardChange(section.boardId, "update");

    return NextResponse.json({ section: updated });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/sections/:id]", e);
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

    const section = await db.section.findUnique({
      where: { id },
      include: { cards: { include: { attachments: true } } },
    });
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    await requirePermission(section.boardId, user.id, "edit");

    const blobUrls = section.cards.flatMap((card) => [
      card.imageUrl,
      card.thumbUrl,
      card.linkImage,
      card.videoUrl,
      card.fileUrl,
      ...card.attachments.flatMap((a) => [a.url, a.previewUrl]),
    ]);

    await db.$transaction([
      db.card.deleteMany({ where: { sectionId: id } }),
      db.section.delete({ where: { id } }),
    ]);
    await enqueueBlobDeletion(blobUrls, "section.delete", "Section", id);

    await touchBoardUpdatedAt(section.boardId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[DELETE /api/sections/:id]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
