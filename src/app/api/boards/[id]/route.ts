import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { enqueueBlobDeletion } from "@/lib/blob-cleanup";
import { snapshotClassroomGroupsToBoard } from "@/lib/default-groups";

const PatchBoardSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  classroomId: z.string().nullable().optional(),
  streamTitlePrompt: z.string().max(200).optional(),
  streamContentPrompt: z.string().max(1000).optional(),
  streamSectionsEnabled: z.boolean().optional(),
  thumbnailMode: z.enum(["default", "none", "custom"]).optional(),
  // Public image URL for board thumbnail. Used when thumbnailMode="custom";
  // empty/null is normalized to null. custom+null is accepted so the client
  // can fall back to the layout default.
  thumbnailUrl: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v == null || v === "" ? null : v)),
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
  // BC-1: reclassify a board as lesson vs play.
  category: z.enum(["LESSON", "PLAY"]).optional(),
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
      board.thumbnailUrl,
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
    if (Object.prototype.hasOwnProperty.call(input, "classroomId")) {
      if (board.layout === "dj-queue" && input.classroomId == null) {
        return NextResponse.json(
          { error: "DJ 보드는 학급 연결이 필요합니다." },
          { status: 400 }
        );
      }
      if (input.classroomId) {
        const classroom = await db.classroom.findUnique({
          where: { id: input.classroomId },
          select: { teacherId: true },
        });
        if (!classroom) {
          return NextResponse.json(
            { error: "classroom_not_found" },
            { status: 404 }
          );
        }
        if (classroom.teacherId !== user.id) {
          return NextResponse.json(
            { error: "not_classroom_teacher" },
            { status: 403 }
          );
        }
      }
    }
    const updated = await db.$transaction(async (tx) => {
      const next = await tx.board.update({ where: { id: board.id }, data: input });
      if (
        Object.prototype.hasOwnProperty.call(input, "classroomId") &&
        input.classroomId !== board.classroomId
      ) {
        await tx.boardDefaultGroupMember.deleteMany({ where: { boardId: board.id } });
        await tx.boardDefaultGroup.deleteMany({ where: { boardId: board.id } });
        if (input.classroomId) {
          await snapshotClassroomGroupsToBoard(tx, input.classroomId, board.id);
        }
      }
      return next;
    });
    if (
      Object.prototype.hasOwnProperty.call(input, "thumbnailUrl") &&
      board.thumbnailUrl &&
      board.thumbnailUrl !== input.thumbnailUrl
    ) {
      await enqueueBlobDeletion(
        [board.thumbnailUrl],
        "board.thumbnail.update",
        "Board",
        board.id
      );
    }

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
