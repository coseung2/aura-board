import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { viewSection } from "@/lib/rbac";
import { SubmitMissionSchema } from "@/lib/statistics/schemas";
import { z } from "zod";

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

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);

    await viewSection(sectionId, {
      userId: user?.id ?? null,
      studentClassroomId: student?.classroomId ?? null,
    });

    if (student) {
      const membership = await db.breakoutMembership.findFirst({
        where: { sectionId, studentId: student.id },
      });
      if (!membership) {
        return NextResponse.json({ error: "not_your_team" }, { status: 403 });
      }
    }

    const body = await req.json();
    const input = SubmitMissionSchema.parse(body);

    const existing = await db.mission.findUnique({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (existing.version !== input.expectedVersion) {
      return NextResponse.json(
        { error: "VERSION_CONFLICT", currentVersion: existing.version },
        { status: 409 }
      );
    }

    const updated = await db.mission.update({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
      data: {
        status: "pending_approval",
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });

    return NextResponse.json({ mission: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/sections/:id/missions/:step/submit]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
