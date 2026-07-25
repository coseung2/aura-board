import "server-only";

import { db } from "@/lib/db";
import { sendExpoPush } from "@/lib/expo-push";

export type StudentPushKind = "like" | "comment" | "reward";

export type StudentNotificationPush = {
  eventKey: string;
  studentId: string;
  kind: StudentPushKind;
  title: string;
  body: string;
  href: string;
};

export async function dispatchStudentNotificationPush(
  input: StudentNotificationPush,
): Promise<{ attempted: number; skipped: number }> {
  try {
    const devices = await db.studentPushDevice.findMany({
      where: { studentId: input.studentId, disabledAt: null },
      select: { id: true, expoPushToken: true },
    });
    if (devices.length === 0) return { attempted: 0, skipped: 0 };

    try {
      await db.studentPushDispatch.create({
        data: { studentId: input.studentId, eventKey: input.eventKey },
      });
    } catch (error) {
      if ((error as { code?: unknown })?.code === "P2002") {
        return { attempted: 0, skipped: devices.length };
      }
      throw error;
    }

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
