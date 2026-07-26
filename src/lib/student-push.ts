import "server-only";

import { db } from "@/lib/db";
import { sendExpoPush } from "@/lib/expo-push";
import type { StudentNotificationKind } from "@/lib/student-notification-contract";

export type StudentPushKind = StudentNotificationKind;

export type StudentNotificationPush = {
  eventKey: string;
  studentId: string;
  kind: StudentPushKind;
  title: string;
  body: string;
  href: string;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
export const ATTENDANCE_REMINDER_KST_HOUR = 8;

export function studentPushKstDay(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) throw new RangeError("invalid_date");
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function shouldSendAttendanceReminder(now: Date = new Date()): boolean {
  if (Number.isNaN(now.getTime())) throw new RangeError("invalid_date");
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCHours()
    >= ATTENDANCE_REMINDER_KST_HOUR;
}

export function attendanceReminderPush(
  studentId: string,
  day = studentPushKstDay(),
): StudentNotificationPush {
  return {
    eventKey: `attendance-missing:${studentId}:${day}`,
    studentId,
    kind: "attendance",
    title: "오늘 출석을 확인해 주세요",
    body: "Aura Board에 들어와 오늘의 출석을 기록해 주세요.",
    href: "/student",
  };
}

export function assignmentDistributedPush(input: {
  slotId: string;
  studentId: string;
  boardSlug: string;
  boardTitle: string;
}): StudentNotificationPush {
  return {
    eventKey: `assignment-distributed:${input.slotId}`,
    studentId: input.studentId,
    kind: "assignment",
    title: "새 과제가 도착했어요",
    body: `${input.boardTitle || "과제 보드"} 과제를 확인해 주세요.`,
    href: `/board/${encodeURIComponent(input.boardSlug)}`,
  };
}

export async function dispatchStudentNotificationPush(
  input: StudentNotificationPush,
): Promise<{ attempted: number; skipped: number }> {
  try {
    try {
      await db.studentPushDispatch.create({
        data: {
          studentId: input.studentId,
          eventKey: input.eventKey,
          kind: input.kind,
          title: input.title,
          body: input.body,
          href: input.href,
        },
      });
    } catch (error) {
      if ((error as { code?: unknown })?.code === "P2002") {
        const activeDeviceCount = await db.studentPushDevice.count({
          where: { studentId: input.studentId, disabledAt: null },
        });
        return { attempted: 0, skipped: activeDeviceCount };
      }
      throw error;
    }

    const devices = await db.studentPushDevice.findMany({
      where: { studentId: input.studentId, disabledAt: null },
      select: { id: true, expoPushToken: true },
    });
    if (devices.length === 0) return { attempted: 0, skipped: 0 };

    const result = await sendExpoPush(devices, {
      title: input.title,
      body: input.body,
      data: {
        type: "student_notification",
        kind: input.kind,
        href: input.href,
      },
    });
    if (result.invalidDeviceIds.length > 0) {
      await db.studentPushDevice.updateMany({
        where: { id: { in: result.invalidDeviceIds } },
        data: { disabledAt: new Date() },
      });
    }
    return { attempted: result.attempted, skipped: 0 };
  } catch (error) {
    console.error("[student-push] dispatch failed", {
      eventKey: input.eventKey,
      studentId: input.studentId,
      error,
    });
    return { attempted: 0, skipped: 0 };
  }
}
