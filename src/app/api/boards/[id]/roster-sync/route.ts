import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ASSIGNMENT_MAX_SLOTS } from "@/lib/assignment-schemas";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ASSIGN_CARD_W = 240;
const ASSIGN_CARD_H = 160;

// Request body. `classroomId` is the attach-classroom path (used when the
// board was created empty and the teacher now picks a classroom from the
// in-board FAB). When omitted the endpoint behaves as a pure incremental
// sync against the already-attached classroom.
const RosterSyncSchema = z.object({ classroomId: z.string().min(1).optional() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: boardId } = await ctx.params;
  const user = await getCurrentUser();

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = RosterSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      layout: true,
      classroomId: true,
      assignmentDeadline: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (board.layout !== "assignment") {
    return NextResponse.json({ error: "not_assignment_board" }, { status: 400 });
  }

  // Pick target classroom: either the one the board is already bound to, or
  // the one being attached via the request body on first-time use.
  let targetClassroomId: string;
  if (board.classroomId) {
    if (!board.classroom || board.classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
    }
    if (parsed.data.classroomId && parsed.data.classroomId !== board.classroomId) {
      return NextResponse.json({ error: "classroom_already_attached" }, { status: 409 });
    }
    targetClassroomId = board.classroomId;
  } else {
    if (!parsed.data.classroomId) {
      return NextResponse.json({ error: "classroom_required" }, { status: 400 });
    }
    const c = await db.classroom.findUnique({
      where: { id: parsed.data.classroomId },
      select: { id: true, teacherId: true },
    });
    if (!c) return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
    if (c.teacherId !== user.id) {
      return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
    }
    targetClassroomId = c.id;
  }

  const existingSlots = await db.assignmentSlot.findMany({
    where: { boardId },
    select: { studentId: true, slotNumber: true },
  });
  const existingStudentIds = new Set(existingSlots.map((s) => s.studentId));
  const maxSlotNumber = existingSlots.reduce((acc, s) => Math.max(acc, s.slotNumber), 0);

  const roster = await db.student.findMany({
    where: { classroomId: targetClassroomId },
    orderBy: [{ number: "asc" }, { createdAt: "asc" }],
  });
  const newStudents = roster.filter((s) => !existingStudentIds.has(s.id));

  if (existingSlots.length + newStudents.length > ASSIGNMENT_MAX_SLOTS) {
    return NextResponse.json(
      {
        error: "would_exceed_max",
        max: ASSIGNMENT_MAX_SLOTS,
        existing: existingSlots.length,
        incoming: newStudents.length,
      },
      { status: 400 }
    );
  }

  const added: { id: string; slotNumber: number; studentId: string; studentName: string }[] = [];
  // On the first-attach path we prefer Student.number as the snapshot
  // slotNumber (so the 5×6 grid lines up with attendance numbers) and fall
  // back to an incrementing cursor only for students without a number. On
  // subsequent syncs we append after the current max to avoid collisions.
  const firstAttach = existingSlots.length === 0;
  let cursor = maxSlotNumber;

  await db.$transaction(async (tx) => {
    if (!board.classroomId) {
      await tx.board.update({
        where: { id: boardId },
        data: { classroomId: targetClassroomId },
      });
    }
    for (const s of newStudents) {
      let n: number;
      if (firstAttach && s.number != null) {
        n = s.number;
      } else {
        cursor += 1;
        n = cursor;
      }
      if (firstAttach && s.number != null && s.number > cursor) {
        cursor = s.number;
      }
      const col = (n - 1) % 5;
      const row = Math.floor((n - 1) / 5);
      const card = await tx.card.create({
        data: {
          boardId,
          authorId: user.id,
          studentAuthorId: s.id,
          externalAuthorName: s.name,
          title: "",
          content: "",
          x: col * ASSIGN_CARD_W,
          y: row * ASSIGN_CARD_H,
          width: ASSIGN_CARD_W,
          height: ASSIGN_CARD_H,
        },
      });
      const newSlot = await tx.assignmentSlot.create({
        data: {
          boardId,
          studentId: s.id,
          slotNumber: n,
          cardId: card.id,
          dueAt: board.assignmentDeadline,
        },
      });
      await tx.cardAuthor.create({
        data: {
          cardId: card.id,
          studentId: s.id,
          displayName: s.name,
          order: 0,
        },
      });
      added.push({
        id: newSlot.id,
        slotNumber: n,
        studentId: s.id,
        studentName: s.name,
      });
    }
  });

  // classroom-boards-tab "🟢 새 활동" 배지 — 새 슬롯(=카드) 추가가 있으면 touch.
  // 첫 attach 경로는 트랜잭션 안에서 board.update({classroomId})로 이미
  // @updatedAt bump됐지만, 중복 호출되어도 best-effort라 무해.
  if (added.length > 0) {
    await touchBoardUpdatedAt(boardId);
  }

  return NextResponse.json({
    addedSlots: added,
    skipped: existingSlots.length,
    attached: !board.classroomId,
  });
}
