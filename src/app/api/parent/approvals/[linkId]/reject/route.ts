import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canTransition } from "@/lib/parent-link-state";
import { dispatchParentNotification, type TemplateId } from "@/lib/parent-email";
import { recordRejection } from "@/lib/rate-limit-parent";

// parent-class-invite-v2 — POST /api/parent/approvals/[linkId]/reject
// Transitions pending → rejected with a structured reason. Email dispatch
// is after-commit and guarded by PARENT_EMAIL_ENABLED.

const Schema = z.object({
  reason: z.enum(["wrong_child", "not_parent", "other"]),
});

const TEMPLATE_BY_REASON: Record<z.infer<typeof Schema>["reason"], TemplateId> = {
  wrong_child: "parent-rejected-wrong-child",
  not_parent: "parent-rejected-not-parent",
  other: "parent-rejected-other",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    const user = await getCurrentUser();
    const { linkId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
    }
    const link = await db.parentChildLink.findUnique({
      where: { id: linkId },
      include: {
        parent: { select: { email: true } },
        student: { include: { classroom: true } },
      },
    });
    if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (link.student.classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!canTransition(link.status, "rejected")) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }
    const now = new Date();
    await db.parentChildLink.update({
      where: { id: link.id },
      data: {
        status: "rejected",
        rejectedAt: now,
        rejectedById: user.id,
        rejectedReason: parsed.data.reason,
      },
    });
    await recordRejection(link.parent.email);

    // after-commit email
    const origin = new URL(req.url).origin;
    await dispatchParentNotification({
      to: link.parent.email,
      subject: "[Aura-board] 연결 신청 결과 안내",
      template: TEMPLATE_BY_REASON[parsed.data.reason],
      props: { retryUrl: `${origin}/parent/onboard/match/code` },
    });

    return NextResponse.json({
      linkId: link.id,
      status: "rejected",
      rejectedAt: now.toISOString(),
    });
  } catch (e) {
    console.error("[POST /api/parent/approvals/:id/reject]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
