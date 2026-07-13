import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  approveDailyBannerSubmission,
  DailyBannerModerationError,
} from "@/lib/daily-banner-moderation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function moderationErrorResponse(error: unknown) {
  if (error instanceof DailyBannerModerationError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  console.error("[POST /api/classrooms/:id/daily-banners/:submissionId/approve]", error);
  return NextResponse.json({ error: "internal" }, { status: 500 });
}
// POST /api/classrooms/:id/daily-banners/:submissionId/approve
// Only the teacher owning the submission's classroom can approve it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: classroomId, submissionId } = await params;
  try {
    const result = await approveDailyBannerSubmission({
      classroomId,
      submissionId,
      reviewerId: user.id,
    });

    await logAudit({
      actorType: "teacher",
      actorId: user.id,
      action: "daily_banner.approve",
      resourceType: "daily_banner_submission",
      resourceId: submissionId,
      metadata: {
        day: result.publication?.day ?? result.submission.targetDay,
        publicationId: result.publication?.id ?? null,
        idempotent: result.idempotent,
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      submission: result.submission,
      publication: result.publication,
    });
  } catch (error) {
    return moderationErrorResponse(error);
  }
}
