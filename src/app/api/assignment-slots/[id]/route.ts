import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SlotTransitionSchema } from "@/lib/assignment-schemas";
import {
  computeTeacherTransition,
} from "@/lib/assignment-state";
import type {
  AssignmentSubmissionStatus,
  AssignmentGradingStatus,
} from "@/lib/assignment-schemas";
import { slotRowToDTO, SLOT_INCLUDE_DEFAULT } from "@/lib/assignment-api";
import { assignmentChannelKey } from "@/lib/realtime";
import { scheduleRealtimePublish } from "@/lib/realtime-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: slotId } = await ctx.params;
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = SlotTransitionSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? parsed.error.message;
    const code = msg.includes("returnReason") ? "returnReason_required" : "validation_failed";
    return NextResponse.json({ error: code, detail: msg }, { status: 400 });
  }

  const slot = await db.assignmentSlot.findUnique({
    where: { id: slotId },
    include: {
      board: { select: { classroom: { select: { teacherId: true } } } },
    },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (!slot.board.classroom || slot.board.classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
  }

  const result = computeTeacherTransition(
    {
      submissionStatus: slot.submissionStatus as AssignmentSubmissionStatus,
      gradingStatus: slot.gradingStatus as AssignmentGradingStatus,
    },
    parsed.data
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: "invalid_transition", from: result.from },
      { status: 409 }
    );
  }

  const updated = await db.assignmentSlot.update({
    where: { id: slotId },
    data: {
      submissionStatus: result.next.submissionStatus,
      gradingStatus: result.next.gradingStatus,
      ...(result.next.viewedAt ? { viewedAt: result.next.viewedAt } : {}),
      ...(result.next.returnedAt ? { returnedAt: result.next.returnedAt } : {}),
      ...(result.next.returnReason !== undefined
        ? { returnReason: result.next.returnReason }
        : {}),
      ...(result.next.grade !== undefined ? { grade: result.next.grade } : {}),
    },
    include: SLOT_INCLUDE_DEFAULT,
  });

  console.log(
    `[AssignmentSlot] transition slotId=${slotId} from=${slot.submissionStatus} to=${updated.submissionStatus} actor=teacher actorId=${user.id}`
  );

  scheduleRealtimePublish({
    channel: assignmentChannelKey(slot.boardId),
    type: "slot.updated",
    payload: {
      slotId: updated.id,
      submissionStatus: updated.submissionStatus,
      gradingStatus: updated.gradingStatus,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });

  return NextResponse.json({ slot: slotRowToDTO(updated) });
}
