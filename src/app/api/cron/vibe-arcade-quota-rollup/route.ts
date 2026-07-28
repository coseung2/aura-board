// Vibe-arcade quota rollup (Seed 13, D-PHASE3-08).
// 일별 00:10 KST — Sonnet 토큰 사용량을 (classroomId, studentId?, date)로 집계.
// incrementLedger가 실시간 반영하므로 본 cron은 무결성 점검(day rollover) + 빈 행 보정만.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CLASSROOM_WIDE_SENTINEL } from "@/lib/vibe-arcade/quota-ledger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Rollup verification: ensure every classroom with sessions yesterday has
  // a matching classroom-wide ledger row. Real-time increments already cover
  // the common case; this is defensive for missed writes (network blip etc.).
  const yesterdayStart = new Date();
  yesterdayStart.setUTCHours(0, 0, 0, 0);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart.getTime() + 24 * 60 * 60 * 1000);

  const sessions = await db.vibeSession.findMany({
    where: {
      startedAt: { gte: yesterdayStart, lt: yesterdayEnd },
    },
    select: { classroomId: true, studentId: true, tokensIn: true, tokensOut: true },
  });

  // Group by classroom.
  const byClassroom = new Map<string, { tokensIn: number; tokensOut: number; sessions: number }>();
  for (const s of sessions) {
    const cur = byClassroom.get(s.classroomId) ?? { tokensIn: 0, tokensOut: 0, sessions: 0 };
    cur.tokensIn += s.tokensIn;
    cur.tokensOut += s.tokensOut;
    cur.sessions += 1;
    byClassroom.set(s.classroomId, cur);
  }

  let upserts = 0;
  for (const [classroomId, totals] of byClassroom) {
    await db.vibeQuotaLedger.upsert({
      where: {
        classroomId_studentId_date: {
          classroomId,
          studentId: CLASSROOM_WIDE_SENTINEL,
          date: yesterdayStart,
        },
      },
      create: {
        classroomId,
        studentId: CLASSROOM_WIDE_SENTINEL,
        date: yesterdayStart,
        tokensIn: totals.tokensIn,
        tokensOut: totals.tokensOut,
        sessionsCount: totals.sessions,
      },
      update: {
        // Only correct if the real-time path missed — don't double-count.
        tokensIn: totals.tokensIn,
        tokensOut: totals.tokensOut,
        sessionsCount: totals.sessions,
      },
    });
    upserts++;
  }

  return NextResponse.json({ ok: true, classroomsProcessed: upserts });
}
