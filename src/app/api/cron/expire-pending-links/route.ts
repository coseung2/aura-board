import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dispatchOnce, dispatchParentNotification } from "@/lib/parent-email";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// parent-class-invite-v2 — GET /api/cron/expire-pending-links.
// Invoked by Vercel Cron at KST 02:00 (UTC 17:00) daily. See vercel.json.
// Does 3 things in one sweep:
//   1. D+7 expire: pending → rejected(auto_expired), notify parent + D+7 summary per classroom
//   2. D+6 warning: classroom-grouped teacher email
//   3. D+3 reminder: classroom-grouped teacher email
//
// Idempotency key per teacher email uses YYYYMMDD so one Cron run sends at
// most one email of each kind per classroom per day.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function kstDateStamp(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const retryUrl = `${origin}/parent/onboard/match/code`;
  const now = new Date();
  const stamp = kstDateStamp(now);
  const cutoff7 = new Date(now.getTime() - 7 * MS_PER_DAY);
  const cutoff6Lo = new Date(now.getTime() - 7 * MS_PER_DAY);
  const cutoff6Hi = new Date(now.getTime() - 6 * MS_PER_DAY);
  const cutoff3Lo = new Date(now.getTime() - 4 * MS_PER_DAY);
  const cutoff3Hi = new Date(now.getTime() - 3 * MS_PER_DAY);

  // 1. D+7 expire ---------------------------------------------------------
  const expiring = await db.parentChildLink.findMany({
    where: {
      status: "pending",
      requestedAt: { lt: cutoff7 },
      deletedAt: null,
    },
    include: {
      parent: { select: { email: true } },
      student: {
        include: { classroom: { include: { teacher: { select: { email: true } } } } },
      },
    },
  });

  if (expiring.length > 0) {
    await db.parentChildLink.updateMany({
      where: { id: { in: expiring.map((e) => e.id) } },
      data: {
        status: "rejected",
        rejectedAt: now,
        rejectedReason: "auto_expired",
      },
    });
    await Promise.allSettled(
      expiring.map((e) =>
        dispatchParentNotification({
          to: e.parent.email,
          subject: "[Aura-board] 연결 신청이 자동 만료되었습니다",
          template: "parent-auto-expired",
          props: { retryUrl },
        })
      )
    );
    // Teacher D+7 summary — one per classroom
    const byClassroom = groupBy(expiring, (e) => e.student.classroom.id);
    for (const [classroomId, rows] of byClassroom) {
      const classroom = rows[0].student.classroom;
      const inboxUrl = `${origin}/classroom/${classroomId}/parent-access`;
      await dispatchOnce(`teacher-summary-d7:${classroomId}:${stamp}`, {
        to: classroom.teacher.email,
        subject: `[Aura-board] ${classroom.name} 자동 만료 요약`,
        template: "teacher-summary-d7",
        props: { classroomName: classroom.name, expiredCount: rows.length, inboxUrl },
      });
    }
  }

  // 2. D+6 warning --------------------------------------------------------
  const d6 = await db.parentChildLink.findMany({
    where: {
      status: "pending",
      requestedAt: { gte: cutoff6Lo, lt: cutoff6Hi },
      deletedAt: null,
    },
    include: {
      student: {
        include: { classroom: { include: { teacher: { select: { email: true } } } } },
      },
    },
  });
  const d6ByClassroom = groupBy(d6, (l) => l.student.classroom.id);
  for (const [classroomId, rows] of d6ByClassroom) {
    const classroom = rows[0].student.classroom;
    const inboxUrl = `${origin}/classroom/${classroomId}/parent-access`;
    await dispatchOnce(`teacher-warning-d6:${classroomId}:${stamp}`, {
      to: classroom.teacher.email,
      subject: `[Aura-board] ${classroom.name} 승인 대기 6일 경고`,
      template: "teacher-warning-d6",
      props: { classroomName: classroom.name, pendingCount: rows.length, inboxUrl },
    });
  }

  // 3. D+3 reminder -------------------------------------------------------
  const d3 = await db.parentChildLink.findMany({
    where: {
      status: "pending",
      requestedAt: { gte: cutoff3Lo, lt: cutoff3Hi },
      deletedAt: null,
    },
    include: {
      student: {
        include: { classroom: { include: { teacher: { select: { email: true } } } } },
      },
    },
  });
  const d3ByClassroom = groupBy(d3, (l) => l.student.classroom.id);
  for (const [classroomId, rows] of d3ByClassroom) {
    const classroom = rows[0].student.classroom;
    const inboxUrl = `${origin}/classroom/${classroomId}/parent-access`;
    await dispatchOnce(`teacher-reminder-d3:${classroomId}:${stamp}`, {
      to: classroom.teacher.email,
      subject: `[Aura-board] ${classroom.name} 승인 대기 알림`,
      template: "teacher-reminder-d3",
      props: { classroomName: classroom.name, pendingCount: rows.length, inboxUrl },
    });
  }

  return NextResponse.json({
    expired: expiring.length,
    d3: d3.length,
    d6: d6.length,
  });
}

function groupBy<T, K>(arr: T[], fn: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = fn(x);
    const b = m.get(k) ?? [];
    b.push(x);
    m.set(k, b);
  }
  return m;
}
