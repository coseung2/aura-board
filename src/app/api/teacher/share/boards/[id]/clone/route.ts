import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  cloneTeacherBoard,
  SUPPORTED_CLONE_LAYOUTS,
} from "@/lib/boards/clone";

const CloneSchema = z.object({ classroomId: z.string().min(1) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = CloneSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const classroom = await db.classroom.findFirst({
    where: { id: parsed.data.classroomId, teacherId: user.id },
    select: { id: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
  }

  const { id } = await params;
  const source = await db.board.findFirst({
    where: {
      id,
      systemGameKind: null,
      communityPublishedAt: { not: null },
    },
    include: {
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!source) {
    return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  }
  if (!SUPPORTED_CLONE_LAYOUTS.has(source.layout)) {
    return NextResponse.json({ error: "unsupported_layout" }, { status: 400 });
  }

  const newBoard = await db.$transaction((tx) =>
    cloneTeacherBoard(
      tx,
      { ...source, cards: [] },
      user.id,
      {
        title: source.title ? `${source.title} (복사본)` : "(복사본)",
        classroomId: classroom.id,
        copyCards: false,
      },
    ),
  );

  return NextResponse.json({
    board: newBoard,
    boardUrl: `/board/${newBoard.slug}`,
  });
}
