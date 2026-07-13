import { NextResponse } from "next/server";
import { ADMIN_EMAIL } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

// DELETE /api/admin/daily-banners/:publicationId
// 관리자 전용 게시 취소. 신청작은 심사 대기로 되돌려 해당 반 교사가 다시
// 승인하거나 다른 날짜의 신청을 고를 수 있게 한다.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ publicationId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.email.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { publicationId } = await params;
  const publication = await db.dailyBannerPublication.findUnique({
    where: { id: publicationId },
    select: { id: true, day: true, submissionId: true },
  });
  if (!publication) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.dailyBannerPublication.delete({ where: { id: publication.id } });
    await tx.dailyBannerSubmission.update({
      where: { id: publication.submissionId },
      data: {
        status: "pending",
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: null,
      },
    });
  });

  await logAudit({
    actorType: "admin",
    action: "admin.daily_banner.unpublish",
    actorId: user.id,
    resourceType: "daily_banner_publication",
    resourceId: publication.id,
    metadata: { day: publication.day.toISOString(), submissionId: publication.submissionId },
  });

  return NextResponse.json({ ok: true });
}
