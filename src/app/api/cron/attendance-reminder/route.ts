import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  dispatchStudentNotificationPushBatch,
  morningTaskReminderPush,
  studentPushKstDay,
} from "@/lib/student-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ATTENDANCE_PAGE_SIZE = 500;
const PUSH_BATCH_SIZE = 100;
const MISSING_SUBMISSION_STATUSES = ["assigned", "returned", "orphaned"] as const;

async function consume(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  const day = studentPushKstDay();
  const studentCode = new URL(req.url).searchParams.get("studentCode")?.trim().toUpperCase() || null;
  const attendanceDate = new Date(`${day}T00:00:00.000Z`);
  let scanned = 0;
  let dispatched = 0;
  let attemptedDevices = 0;
  let failed = 0;
  let afterId: string | undefined;

  while (true) {
    const students = await db.student.findMany({
      where: {
        ...(afterId ? { id: { gt: afterId } } : {}),
        ...(studentCode ? { textCode: studentCode } : {}),
        attendances: { none: { day: attendanceDate } },
        pushDispatches: {
          none: { eventKey: { startsWith: "morning-tasks:", endsWith: `:${day}` } },
        },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        assignmentSlots: {
          where: { submissionStatus: { in: [...MISSING_SUBMISSION_STATUSES] } },
          orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
          select: {
            dueAt: true,
            board: { select: { title: true, slug: true } },
          },
        },
      },
      take: ATTENDANCE_PAGE_SIZE,
    });
    if (students.length === 0) break;

    scanned += students.length;
    const pushes = students.map((student) => morningTaskReminderPush({
      studentId: student.id,
      day,
      assignments: student.assignmentSlots.map((slot) => ({
        boardTitle: slot.board.title,
        boardSlug: slot.board.slug,
        dueAt: slot.dueAt,
      })),
    }));
    for (let start = 0; start < pushes.length; start += PUSH_BATCH_SIZE) {
      const batch = pushes.slice(start, start + PUSH_BATCH_SIZE);
      try {
        const result = await dispatchStudentNotificationPushBatch(
          batch,
          { propagateFailure: true },
        );
        dispatched += result.reserved;
        attemptedDevices += result.attempted;
      } catch {
        failed += batch.length;
      }
    }

    afterId = students[students.length - 1].id;
    if (students.length < ATTENDANCE_PAGE_SIZE) break;
  }

  return NextResponse.json({
    day,
    scanned,
    dispatched,
    attemptedDevices,
    failed,
  });
}

export const GET = consume;
export const POST = consume;
