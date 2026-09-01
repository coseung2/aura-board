import "server-only";

import { db } from "@/lib/db";
import {
  expoPushFailureDetails,
  sendExpoPush,
  sendExpoPushMessages,
} from "@/lib/expo-push";
import type { StudentNotificationKind } from "@/lib/student-notification-contract";

export type StudentPushKind = StudentNotificationKind;

export type StudentNotificationPush = {
  eventKey: string;
  sourceId?: string;
  studentId: string;
  kind: StudentPushKind;
  title: string;
  body: string;
  href: string;
  actorLabel?: string;
  cardTitle?: string;
  boardTitle?: string;
  content?: string | null;
  createdAt?: Date;
};

export type MorningAssignmentReminder = {
  boardTitle: string;
  boardSlug: string;
  dueAt: Date | null;
};

/** Assignment snapshot used by the afternoon attendance digest. */
export type AfternoonAssignmentReminder = MorningAssignmentReminder;

type DispatchOptions = { propagateFailure?: boolean };

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
export const ATTENDANCE_REMINDER_KST_HOUR = 7;
export const ATTENDANCE_REMINDER_KST_MINUTE = 50;

export function studentPushKstDay(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) throw new RangeError("invalid_date");
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function shouldSendAttendanceReminder(now: Date = new Date()): boolean {
  if (Number.isNaN(now.getTime())) throw new RangeError("invalid_date");
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const minuteOfDay = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minuteOfDay >= ATTENDANCE_REMINDER_KST_HOUR * 60 + ATTENDANCE_REMINDER_KST_MINUTE;
}

export function morningTaskReminderPush(input: {
  studentId: string;
  day?: string;
  assignments?: MorningAssignmentReminder[];
}): StudentNotificationPush {
  const day = input.day ?? studentPushKstDay();
  const assignments = input.assignments ?? [];
  const todayAssignments = assignments
    .filter((assignment) => assignment.dueAt && studentPushKstDay(assignment.dueAt) === day)
    .sort((left, right) => left.dueAt!.getTime() - right.dueAt!.getTime());

  const sentences = ["오늘 출석을 확인해 주세요."];
  for (const assignment of todayAssignments.slice(0, 2)) {
    sentences.push(
      `${assignmentLabel(assignment.boardTitle)}의 마감이 오늘 ${formatKstDeadlineTime(assignment.dueAt!)}까지예요.`,
    );
  }
  if (todayAssignments.length > 2) {
    sentences.push(
      `오늘 마감인 과제가 ${todayAssignments.length - 2}개 더 있어요. 과제 목록에서 확인해 주세요.`,
    );
  } else if (todayAssignments.length === 0 && assignments.length === 1) {
    sentences.push(
      `아직 제출하지 않은 과제는 ${assignmentLabel(assignments[0].boardTitle)}예요.`,
    );
  } else if (todayAssignments.length === 0 && assignments.length > 1) {
    sentences.push(
      `아직 제출하지 않은 과제가 ${assignments.length}개 있어요. 과제 목록에서 확인해 주세요.`,
    );
  }

  return {
    eventKey: `morning-tasks:${input.studentId}:${day}`,
    sourceId: `${input.studentId}:${day}`,
    studentId: input.studentId,
    kind: "attendance",
    title: assignments.length > 0
      ? "오늘 출석과 과제를 확인해 주세요"
      : "오늘 출석을 확인해 주세요",
    body: sentences.join(" "),
    href: "/student",
    actorLabel: "Aura Board",
    cardTitle: "오늘 할 일",
    boardTitle: "출석과 과제",
  };
}

/**
 * Build the second daily attendance nudge. The afternoon job intentionally
 * shares the same assignment snapshot semantics as the morning digest, but it
 * has its own event key so a student can receive one reminder at each time of
 * day. Opening `/student` records today's attendance and makes the reminder
 * idempotent at the app boundary.
 */
export function afternoonTaskReminderPush(input: {
  studentId: string;
  day?: string;
  assignments?: AfternoonAssignmentReminder[];
}): StudentNotificationPush {
  const day = input.day ?? studentPushKstDay();
  const assignments = input.assignments ?? [];
  const todayAssignments = assignments
    .filter((assignment) => assignment.dueAt && studentPushKstDay(assignment.dueAt) === day)
    .sort((left, right) => left.dueAt!.getTime() - right.dueAt!.getTime());

  const sentences = [
    "오늘 아직 출석하지 않았어요. 지금 출석하면 출석 보상을 받을 수 있어요.",
  ];
  for (const assignment of todayAssignments.slice(0, 2)) {
    sentences.push(
      `${assignmentLabel(assignment.boardTitle)}의 마감이 오늘 ${formatKstDeadlineTime(assignment.dueAt!)}까지예요.`,
    );
  }
  if (todayAssignments.length > 2) {
    sentences.push(
      `오늘 마감인 과제가 ${todayAssignments.length - 2}개 더 있어요. 과제 목록에서 확인해 주세요.`,
    );
  } else if (todayAssignments.length === 0 && assignments.length === 1) {
    sentences.push(
      `아직 제출하지 않은 과제는 ${assignmentLabel(assignments[0].boardTitle)}예요.`,
    );
  } else if (todayAssignments.length === 0 && assignments.length > 1) {
    sentences.push(
      `아직 제출하지 않은 과제가 ${assignments.length}개 있어요. 과제 목록에서 확인해 주세요.`,
    );
  }

  return {
    eventKey: `afternoon-tasks:${input.studentId}:${day}`,
    // Keep the notification-center source distinct from the morning digest;
    // StudentNotification also enforces (studentId, kind, sourceId) uniqueness.
    sourceId: `afternoon:${input.studentId}:${day}`,
    studentId: input.studentId,
    kind: "attendance",
    title: assignments.length > 0
      ? "오후 출석과 과제를 확인해 주세요"
      : "오후 출석 보상을 확인해 주세요",
    body: sentences.join(" "),
    href: "/student",
    actorLabel: "Aura Board",
    cardTitle: "오늘 할 일",
    boardTitle: "출석과 과제",
  };
}

/** Descriptive alias for callers that prefer the attendance domain name. */
export const afternoonAttendanceReminderPush = afternoonTaskReminderPush;

/** Backward-compatible builder for callers that only need attendance. */
export function attendanceReminderPush(
  studentId: string,
  day = studentPushKstDay(),
): StudentNotificationPush {
  return morningTaskReminderPush({ studentId, day, assignments: [] });
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
  options: DispatchOptions = {},
): Promise<{ attempted: number; skipped: number }> {
  let dispatchId: string | null = null;
  try {
    const notification = await db.studentNotification.upsert({
      where: {
        studentId_eventKey: {
          studentId: input.studentId,
          eventKey: input.eventKey,
        },
      },
      create: notificationCreateData(input),
      update: {},
      select: {
        kind: true,
        title: true,
        content: true,
        href: true,
      },
    });
    const canonicalInput = notificationPushFromStoredRow(input, notification);

    try {
      const dispatch = await db.studentPushDispatch.create({
        data: {
          studentId: canonicalInput.studentId,
          eventKey: canonicalInput.eventKey,
          kind: canonicalInput.kind,
          title: canonicalInput.title,
          body: canonicalInput.body,
          href: canonicalInput.href,
        },
      });
      dispatchId = dispatch.id;
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
    // Keep the notification-center row, but release the push reservation when
    // there is no registered device yet. Students commonly open the app after
    // the morning cron has run; retaining this reservation would suppress the
    // reminder for the rest of the day and prevent a later retry.
    if (devices.length === 0) {
      await releaseStudentPushReservation(dispatchId, input);
      dispatchId = null;
      return { attempted: 0, skipped: 0 };
    }

    const result = await sendExpoPush(devices, pushMessage(canonicalInput));
    await disableInvalidDevices(result.invalidDeviceIds, canonicalInput);
    return { attempted: result.attempted, skipped: 0 };
  } catch (error) {
    const released = dispatchId
      ? await releaseStudentPushReservation(dispatchId, input)
      : false;
    console.error("[student-push] dispatch failed", {
      eventKey: input.eventKey,
      studentId: input.studentId,
      reservationReleased: released,
      error: expoPushFailureDetails(error),
    });
    if (options.propagateFailure) throw error;
    return { attempted: 0, skipped: 0 };
  }
}

/**
 * Persists, reserves, and sends many student-specific messages as one bounded
 * operation. Expo messages are grouped in batches of 100 by sendExpoPushMessages.
 */
export async function dispatchStudentNotificationPushBatch(
  inputs: StudentNotificationPush[],
  options: DispatchOptions = {},
): Promise<{ attempted: number; skipped: number; reserved: number }> {
  const unique = Array.from(new Map(
    inputs.map((input) => [`${input.studentId}\u001f${input.eventKey}`, input]),
  ).values());
  if (unique.length === 0) return { attempted: 0, skipped: 0, reserved: 0 };

  let reservations: Array<{ id: string; studentId: string; eventKey: string }> = [];

  try {
    await db.studentNotification.createMany({
      data: unique.map(notificationCreateData),
      skipDuplicates: true,
    });
    const notifications = await db.studentNotification.findMany({
      where: {
        OR: unique.map((input) => ({
          studentId: input.studentId,
          eventKey: input.eventKey,
        })),
      },
      select: {
        studentId: true,
        eventKey: true,
        kind: true,
        title: true,
        content: true,
        href: true,
      },
    });
    const notificationsByKey = new Map(
      notifications.map((notification) => [
        notificationKey(notification),
        notification,
      ]),
    );
    const canonicalInputs = unique.map((input) => {
      const notification = notificationsByKey.get(notificationKey(input));
      if (!notification) throw new Error("student_notification_canonical_row_missing");
      return notificationPushFromStoredRow(input, notification);
    });
    const inputByKey = new Map(
      canonicalInputs.map((input) => [notificationKey(input), input]),
    );
    reservations = await db.studentPushDispatch.createManyAndReturn({
      data: canonicalInputs.map((input) => ({
        studentId: input.studentId,
        eventKey: input.eventKey,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
      })),
      skipDuplicates: true,
      select: { id: true, studentId: true, eventKey: true },
    });

    if (reservations.length === 0) {
      return { attempted: 0, skipped: unique.length, reserved: 0 };
    }

    const devices = await db.studentPushDevice.findMany({
      where: {
        studentId: { in: [...new Set(reservations.map((row) => row.studentId))] },
        disabledAt: null,
      },
      select: { id: true, studentId: true, expoPushToken: true },
    });
    const devicesByStudent = new Map<string, typeof devices>();
    for (const device of devices) {
      const current = devicesByStudent.get(device.studentId) ?? [];
      current.push(device);
      devicesByStudent.set(device.studentId, current);
    }

    const envelopes = reservations.flatMap((reservation) => {
      const input = inputByKey.get(`${reservation.studentId}\u001f${reservation.eventKey}`);
      if (!input) return [];
      return (devicesByStudent.get(reservation.studentId) ?? []).map((device) => ({
        device: { id: device.id, expoPushToken: device.expoPushToken },
        message: pushMessage(input),
      }));
    });
    if (envelopes.length === 0) {
      // As above, a reservation without a device must not permanently mark
      // the event as delivered. Delete only the reservations created by this
      // invocation; the notification-center rows remain available.
      await db.studentPushDispatch.deleteMany({
        where: { id: { in: reservations.map((row) => row.id) } },
      });
      return {
        attempted: 0,
        skipped: unique.length - reservations.length,
        reserved: 0,
      };
    }

    const result = await sendExpoPushMessages(envelopes);
    if (result.invalidDeviceIds.length > 0) {
      await db.studentPushDevice.updateMany({
        where: { id: { in: result.invalidDeviceIds } },
        data: { disabledAt: new Date() },
      });
    }
    return {
      attempted: result.attempted,
      skipped: unique.length - reservations.length,
      reserved: reservations.length,
    };
  } catch (error) {
    if (reservations.length > 0) {
      await db.studentPushDispatch.deleteMany({
        where: { id: { in: reservations.map((row) => row.id) } },
      }).catch(() => undefined);
    }
    console.error("[student-push] batch dispatch failed", {
      notifications: unique.length,
      reservations: reservations.length,
      error: expoPushFailureDetails(error),
    });
    if (options.propagateFailure) throw error;
    return { attempted: 0, skipped: 0, reserved: 0 };
  }
}

function notificationCreateData(input: StudentNotificationPush) {
  return {
    studentId: input.studentId,
    eventKey: input.eventKey,
    sourceId: input.sourceId ?? sourceIdFromEventKey(input.eventKey),
    kind: input.kind,
    actorLabel: input.actorLabel ?? "Aura Board",
    title: input.title,
    cardTitle: input.cardTitle ?? input.title,
    boardTitle: input.boardTitle ?? defaultBoardTitle(input.kind),
    href: input.href,
    content: input.content === undefined ? input.body : input.content,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
}

function notificationPushFromStoredRow(
  input: StudentNotificationPush,
  notification: {
    kind: string;
    title: string | null;
    content: string | null;
    href: string;
  },
): StudentNotificationPush {
  const kind = notification.kind as StudentPushKind;
  return {
    ...input,
    kind,
    title: notification.title ?? input.title,
    body: notification.content ?? input.body,
    href: notification.href,
  };
}

function notificationKey(input: { studentId: string; eventKey: string }): string {
  return `${input.studentId}\u001f${input.eventKey}`;
}

function pushMessage(input: StudentNotificationPush) {
  return {
    title: input.title,
    body: input.body,
    data: {
      type: "student_notification",
      kind: input.kind,
      href: input.href,
    },
  };
}

function assignmentLabel(title: string): string {
  const normalized = title.trim() || "과제";
  return normalized.endsWith("과제") ? normalized : `${normalized} 과제`;
}

function formatKstDeadlineTime(value: Date): string {
  const shifted = new Date(value.getTime() + KST_OFFSET_MS);
  const hour24 = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;
  return minute === 0
    ? `${period} ${hour12}시`
    : `${period} ${hour12}시 ${minute}분`;
}

function sourceIdFromEventKey(eventKey: string): string {
  const separator = eventKey.indexOf(":");
  return separator >= 0 ? eventKey.slice(separator + 1) : eventKey;
}

function defaultBoardTitle(kind: StudentPushKind): string {
  if (kind === "attendance") return "출석";
  if (kind === "assignment") return "과제";
  if (kind === "wallet" || kind === "reward" || kind === "refund") return "내 통장";
  return "게시판";
}

async function disableInvalidDevices(
  invalidDeviceIds: string[],
  input: StudentNotificationPush,
): Promise<void> {
  if (invalidDeviceIds.length === 0) return;
  try {
    await db.studentPushDevice.updateMany({
      where: { id: { in: invalidDeviceIds } },
      data: { disabledAt: new Date() },
    });
  } catch (error) {
    console.error("[student-push] invalid-device cleanup failed", {
      eventKey: input.eventKey,
      studentId: input.studentId,
      error: safeErrorDetails(error),
    });
  }
}

async function releaseStudentPushReservation(
  dispatchId: string,
  input: StudentNotificationPush,
): Promise<boolean> {
  try {
    await db.studentPushDispatch.delete({ where: { id: dispatchId } });
    return true;
  } catch (error) {
    console.error("[student-push] reservation release failed", {
      eventKey: input.eventKey,
      studentId: input.studentId,
      error: safeErrorDetails(error),
    });
    return false;
  }
}

function safeErrorDetails(error: unknown): { name: string; code?: string } {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return { name, ...(code ? { code } : {}) };
}
