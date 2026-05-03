import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { viewSection } from "@/lib/rbac";
import { RejectMissionSchema } from "@/lib/statistics/schemas";
import { z } from "zod";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; step: string }> }
) {
  try {
    const { id: sectionId, step } = await ctx.params;
    const stepNumber = parseInt(step, 10);
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 11) {
      return NextResponse.json({ error: "invalid_step" }, { status: 400 });
    }

    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "teacher_only" }, { status: 403 });
    }

    await viewSection(sectionId, {
      userId: user.id,
    });

    const body = await req.json().catch(() => ({}));
    const input = RejectMissionSchema.parse(body);

    const existing = await db.mission.findUnique({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (existing.status !== "pending_approval") {
      return NextResponse.json(
        { error: "not_pending_approval", currentStatus: existing.status },
        { status: 400 }
      );
    }

    const updated = await db.mission.update({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
      data: {
        status: "in_progress",
        teacherFeedback: input.feedback,
        version: { increment: 1 },
      },
    });

    return NextResponse.json({ mission: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/sections/:id/missions/:step/reject]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
