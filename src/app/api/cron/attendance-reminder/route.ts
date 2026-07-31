import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  attendanceReminderPush,
  dispatchStudentNotificationPush,
  studentPushKstDay,
} from "@/lib/student-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ATTENDANCE_PAGE_SIZE = 500;
const DISPATCH_CONCURRENCY = 10;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  const day = studentPushKstDay();
  const attendanceDate = new Date(`${day}T00:00:00.000Z`);
  let scanned = 0;
  let dispatched = 0;
  let failed = 0;
  let afterId: string | undefined;

  while (true) {
    const students = await db.student.findMany({
      where: {
        ...(afterId ? { id: { gt: afterId } } : {}),
        attendances: { none: { day: attendanceDate } },
        notifications: {
          none: { eventKey: { startsWith: "attendance-missing:", endsWith: `:${day}` } },
        },
      },
      orderBy: { id: "asc" },
      select: { id: true },
      take: ATTENDANCE_PAGE_SIZE,
    });
    if (students.length === 0) break;

    scanned += students.length;
    let pageCursor = 0;
    await Promise.all(Array.from(
      { length: Math.min(DISPATCH_CONCURRENCY, students.length) },
      async () => {
        while (pageCursor < students.length) {
          const student = students[pageCursor];
          pageCursor += 1;
          try {
            await dispatchStudentNotificationPush(
              attendanceReminderPush(student.id, day),
              { propagateFailure: true },
            );
            dispatched += 1;
          } catch {
            failed += 1;
          }
        }
      },
    ));

    afterId = students[students.length - 1].id;
    if (students.length < ATTENDANCE_PAGE_SIZE) break;
  }

  return NextResponse.json({ day, scanned, dispatched, failed });
}
