import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendParentDigest } from "@/lib/parent-email";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// PV-10 — weekly digest cron for Pro parents only.
//
// Trigger: Vercel Cron, "0 0 * * 1" = Monday 00:00 UTC = Monday 09:00 KST.
// Tier gate: free parents are skipped entirely.
// Activity window: the last 7 calendar days (now - 7d → now).
// Skip-if-zero: if a parent's children have ZERO combined activity across
//   plant observations, breakout joins, and event signups we do not send a
//   mail (spec AC-9).
//
// Vercel and manual callers must send `Authorization: Bearer <CRON_SECRET>`.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Active Pro parents only. "Active" = not soft-deleted.
  const parents = await db.parent.findMany({
    where: { tier: "pro", parentDeletedAt: null },
    include: {
      children: {
        where: { deletedAt: null },
        include: {
          student: { select: { id: true, name: true } },
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ parentId: string; error: string }> = [];

  for (const parent of parents) {
    if (parent.children.length === 0) {
      skipped++;
      continue;
    }

    const children = await Promise.all(
      parent.children.map(async (link) => {
        const studentId = link.studentId;
        const [plantObs, breakouts, eventSubs] = await Promise.all([
          db.plantObservation.count({
            where: {
              observedAt: { gte: weekStart, lte: now },
              studentPlant: { studentId },
            },
          }),
          db.breakoutMembership.count({
            where: { studentId, joinedAt: { gte: weekStart, lte: now } },
          }),
          (async () => {
            const student = await db.student.findUnique({
              where: { id: studentId },
              select: { name: true, number: true, classroomId: true },
            });
            if (!student) return 0;
            return db.submission.count({
              where: {
                applicantName: student.name,
                ...(student.number != null ? { applicantNumber: student.number } : {}),
                board: {
                  classroomId: student.classroomId,
                  eventStart: { not: null },
                },
                createdAt: { gte: weekStart, lte: now },
              },
            });
          })(),
        ]);
        return {
          studentName: link.student.name,
          plantObservations: plantObs,
          breakoutJoined: breakouts,
          eventSignups: eventSubs,
        };
      })
    );

    const totalActivity = children.reduce(
      (sum, c) =>
        sum +
        c.plantObservations +
        c.breakoutJoined +
        c.eventSignups,
      0
    );
    if (totalActivity === 0) {
      skipped++;
      continue;
    }

    try {
      await sendParentDigest({
        to: parent.email,
        parentName: parent.name,
        subject: `[Aura-board] ${parent.name} 님, 이번 주 자녀 활동 요약`,
        children,
        weekStart,
        weekEnd: now,
      });
      sent++;
    } catch (e) {
      errors.push({
        parentId: parent.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    weekStart: weekStart.toISOString(),
    weekEnd: now.toISOString(),
    eligibleParents: parents.length,
    sent,
    skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
  });
}
