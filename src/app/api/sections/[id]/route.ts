import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";

const SortModeSchema = z.enum(["manual", "newest", "oldest", "title"]);

const PatchSectionSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  order: z.number().int().nonnegative().optional(),
  sortMode: SortModeSchema.nullable().optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const section = await db.section.findUnique({ where: { id } });
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    await requirePermission(section.boardId, user.id, "edit");

    const body = await req.json();
    const input = PatchSectionSchema.parse(body);

    const updated = await db.section.update({
      where: { id },
      data: input,
    });

    await touchBoardUpdatedAt(section.boardId);

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
