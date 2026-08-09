import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ReminderSchema } from "@/lib/assignment-schemas";
import { assignmentChannelKey } from "@/lib/realtime";
import { publishRealtimeEvent } from "@/lib/realtime-server";
import {
  claimDistributedCooldown,
  releaseDistributedCooldown,
} from "@/lib/distributed-cooldown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOLDOWN_MS = 5 * 60 * 1000;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: boardId } = await ctx.params;
  const user = await getCurrentUser();

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { id: true, classroom: { select: { teacherId: true } } },
  });
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  if (!board.classroom || board.classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "not_classroom_teacher" }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = ReminderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }

  const targets = await db.assignmentSlot.findMany({
    where: {
      boardId,
      submissionStatus: "assigned",
      ...(parsed.data.studentIds && parsed.data.studentIds.length > 0
        ? { studentId: { in: parsed.data.studentIds } }
        : {}),
    },
    select: { studentId: true },
  });
  const studentIds = targets.map((t) => t.studentId);

  let cooldown;
  try {
    cooldown = await claimDistributedCooldown({
      namespace: "assignment-reminder",
      identifiers: [boardId, user.id],
      ttlMs: COOLDOWN_MS,
    });
  } catch (error) {
    console.error("[assignment reminder] cooldown unavailable", error);
    return NextResponse.json(
      { error: "reminder_cooldown_unavailable" },
      { status: 503 },
    );
  }
  if (!cooldown.ok) {
    return NextResponse.json(
      { error: "reminder_cooldown", retryAfter: cooldown.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(cooldown.retryAfter) },
      },
    );
  }

  const now = Date.now();

  try {
    await publishRealtimeEvent({
      channel: assignmentChannelKey(boardId),
      type: "reminder.issued",
      payload: {
        boardId,
        studentIds,
        issuedAt: new Date(now).toISOString(),
      },
    });
  } catch (error) {
    console.error("[assignment reminder] realtime delivery failed", error);
    try {
      await releaseDistributedCooldown(cooldown.lease);
    } catch (releaseError) {
      console.error("[assignment reminder] cooldown release failed", releaseError);
    }
    return NextResponse.json({ error: "reminder_delivery_failed" }, { status: 503 });
  }

  return NextResponse.json({
    remindedCount: studentIds.length,
    cooldownSeconds: Math.ceil(COOLDOWN_MS / 1000),
  });
}
