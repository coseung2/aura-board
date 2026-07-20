import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getBoardWithClassroom,
  resolveAssignViewer,
  slotRowToDTO,
  SLOT_INCLUDE_DEFAULT,
} from "@/lib/assignment-api";
import { AssignmentDistributionSchema } from "@/lib/assignment-schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: boardId } = await ctx.params;
  const board = await getBoardWithClassroom(boardId);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (board.layout !== "assignment") {
    return NextResponse.json({ error: "not_assignment_board" }, { status: 400 });
  }

  const viewer = await resolveAssignViewer();

  if (viewer.kind === "teacher") {
    if (!board.classroom || board.classroom.teacherId !== viewer.userId) {
      return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
    }
    const slots = await db.assignmentSlot.findMany({
      where: { boardId },
      orderBy: { slotNumber: "asc" },
      include: SLOT_INCLUDE_DEFAULT,
    });
    return NextResponse.json({
      board: {
        id: board.id,
        slug: board.slug,
        title: board.title,
        assignmentGuideText: board.assignmentGuideText ?? "",
        assignmentAllowLate: board.assignmentAllowLate,
        assignmentDeadline: board.assignmentDeadline?.toISOString() ?? null,
      },
      slots: slots.map(slotRowToDTO),
    });
  }

  if (viewer.kind === "student") {
    // Student sees ONLY their own slot — DOM filtering at source (AC-10).
    if (board.classroomId !== viewer.classroomId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const slot = await db.assignmentSlot.findUnique({
      where: { boardId_studentId: { boardId, studentId: viewer.studentId } },
      include: SLOT_INCLUDE_DEFAULT,
    });
    return NextResponse.json({
      board: {
        id: board.id,
        slug: board.slug,
        title: board.title,
        assignmentGuideText: board.assignmentGuideText ?? "",
        assignmentAllowLate: board.assignmentAllowLate,
        assignmentDeadline: board.assignmentDeadline?.toISOString() ?? null,
      },
      slots: slot ? [slotRowToDTO(slot)] : [],
    });
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Distribute (or re-distribute) an assignment with one required absolute
 * deadline. AssignmentSlot.dueAt is the enforcement/reward snapshot; the
 * board field is updated in the same transaction as its presentation mirror.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: boardId } = await ctx.params;
  const board = await getBoardWithClassroom(boardId);
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (board.layout !== "assignment") {
    return NextResponse.json({ error: "not_assignment_board" }, { status: 400 });
  }

  const viewer = await resolveAssignViewer();
  if (viewer.kind !== "teacher") {
    return NextResponse.json({ error: "teacher_auth_required" }, { status: 401 });
  }
  if (!board.classroom || board.classroom.teacherId !== viewer.userId) {
    return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = AssignmentDistributionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const dueAt = new Date(parsed.data.dueAt);
  const distributed = await db.$transaction(async (tx) => {
    await tx.board.update({
      where: { id: boardId },
      data: { assignmentDeadline: dueAt },
    });
    return tx.assignmentSlot.updateMany({
      where: { boardId },
      data: { dueAt },
    });
  });

  return NextResponse.json({
    distribution: {
      boardId,
      dueAt: dueAt.toISOString(),
      slotCount: distributed.count,
    },
  });
}
