import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  DailyBannerModerationError,
  rejectDailyBannerSubmission,
} from "@/lib/daily-banner-moderation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  reason: z.string().trim().max(1_000).nullable().optional(),
});

function moderationErrorResponse(error: unknown) {
  if (error instanceof DailyBannerModerationError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  console.error("[POST /api/classrooms/:id/daily-banners/:submissionId/reject]", error);
  return NextResponse.json({ error: "internal" }, { status: 500 });
}
// POST /api/classrooms/:id/daily-banners/:submissionId/reject
// Body: { reason?: string | null }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { id: classroomId, submissionId } = await params;
  try {
    const result = await rejectDailyBannerSubmission({
      classroomId,
      submissionId,
      reviewerId: user.id,
      reason: parsed.data.reason ?? null,
    });

    await logAudit({
      actorType: "teacher",
      actorId: user.id,
      action: "daily_banner.reject",
      resourceType: "daily_banner_submission",
      resourceId: submissionId,
      metadata: {
        day: result.submission.targetDay,
        reason: result.submission.rejectionReason,
        idempotent: result.idempotent,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      submission: result.submission,
    });
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
