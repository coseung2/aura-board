import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { viewSection } from "@/lib/rbac";
import { ApproveMissionSchema } from "@/lib/statistics/schemas";
import { z } from "zod";

const APPROVAL_GATES = [2, 3, 6, 8];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sectionId: string; step: string }> }
) {
  try {
    const { sectionId, step } = await ctx.params;
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
    const input = ApproveMissionSchema.parse(body);

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

    const updated = await db.$transaction(async (tx) => {
      const mission = await tx.mission.update({
        where: { sectionId_stepNumber: { sectionId, stepNumber } },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: user.id,
          teacherFeedback: input.feedback ?? existing.teacherFeedback,
          version: { increment: 1 },
        },
      });

      // Unlock next mission if this step is an approval gate
      if (APPROVAL_GATES.includes(stepNumber) && stepNumber < 11) {
        const nextMission = await tx.mission.findUnique({
          where: { sectionId_stepNumber: { sectionId, stepNumber: stepNumber + 1 } },
        });
        if (nextMission && nextMission.status === "not_started") {
          await tx.mission.update({
            where: { sectionId_stepNumber: { sectionId, stepNumber: stepNumber + 1 } },
            data: { status: "not_started" }, // already not_started, but ensure it's not locked
          });
        }
      }

      return mission;
    });

    return NextResponse.json({ mission: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/sections/:id/missions/:step/approve]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
