import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  STUDENT_NOTIFICATION_KINDS,
  type StudentNotificationKind,
} from "@/lib/student-notification-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 20;

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [count, notifications] = await Promise.all([
    db.studentNotification.count({
      where: { studentId: student.id, readAt: null },
    }),
    db.studentNotification.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        sourceId: true,
        kind: true,
        actorLabel: true,
        cardTitle: true,
        boardTitle: true,
        href: true,
        content: true,
        createdAt: true,
        readAt: true,
      },
    }),
  ]);

  const items = notifications.flatMap((notification) => {
    if (!isStudentNotificationKind(notification.kind)) return [];
    return [{
      id: `${notification.kind}:${notification.sourceId}`,
      kind: notification.kind,
      actorLabel: notification.actorLabel,
      cardTitle: notification.cardTitle,
      boardTitle: notification.boardTitle,
      href: notification.href,
      createdAt: notification.createdAt.toISOString(),
      ...(notification.content ? { content: notification.content } : {}),
      read: notification.readAt !== null,
    }];
  });

  return NextResponse.json({ count, items });
}

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input = body as { action?: unknown; kind?: unknown; id?: unknown };

  if (input.action === "mark_all_read") {
    await db.studentNotification.updateMany({
      where: { studentId: student.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, action: "mark_all_read" });
  }

  if (
    input.action !== "mark_read" ||
    !(STUDENT_NOTIFICATION_KINDS as readonly unknown[]).includes(input.kind) ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    input.id.length > 128
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const kind = input.kind as StudentNotificationKind;
  const notification = await db.studentNotification.findUnique({
    where: {
      studentId_kind_sourceId: {
        studentId: student.id,
        kind,
        sourceId: input.id,
      },
    },
    select: { id: true },
  });
  if (!notification) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await db.studentNotification.update({
    where: { id: notification.id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, action: "mark_read" });
}

function isStudentNotificationKind(value: string): value is StudentNotificationKind {
  return (STUDENT_NOTIFICATION_KINDS as readonly string[]).includes(value);
}
