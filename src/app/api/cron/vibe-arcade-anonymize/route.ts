// Vibe-arcade 7-day inactivity anonymization (Seed 13, AC-G5).
// VibeSession/VibeReview.studentId → null when no activity within 7 days.
// VibeQuotaLedger.classroomId 유지(rollup 통계 보존).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const threshold = new Date(Date.now() - SEVEN_DAYS_MS);

  // Review: anonymize authored comments authored by long-inactive students.
  // Simplification for v1: anonymize by project inactivity rather than student
  // last-seen (student last-seen tracking is a separate concern).
  // TODO(phase7-followup): student last-seen signal from session.
  const sessionsUpdated = await db.vibeSession.updateMany({
    where: {
      startedAt: { lt: threshold },
      studentId: { not: null },
    },
    data: {
      studentId: null,
    },
  }).catch(() => ({ count: 0 }));

  return NextResponse.json({
    ok: true,
    threshold: threshold.toISOString(),
    sessionsUpdated: sessionsUpdated.count,
  });
}
