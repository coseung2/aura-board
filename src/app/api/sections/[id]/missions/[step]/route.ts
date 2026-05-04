import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { viewSection } from "@/lib/rbac";
import { PatchMissionSchema } from "@/lib/statistics/schemas";
import { isValidStatisticsMissionStep } from "@/lib/statistics/mission-constants";
import { z } from "zod";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; step: string }> }
) {
  try {
    const { id: sectionId, step } = await ctx.params;
    const stepNumber = parseInt(step, 10);
    if (!isValidStatisticsMissionStep(stepNumber)) {
      return NextResponse.json({ error: "invalid_step" }, { status: 400 });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);

    await viewSection(sectionId, {
      userId: user?.id ?? null,
      studentClassroomId: student?.classroomId ?? null,
      token,
    });

    const mission = await db.mission.findUnique({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
    });

    if (!mission) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ mission });
  } catch (e) {
    console.error("[GET /api/sections/:id/missions/:step]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; step: string }> }
) {
  try {
    const { id: sectionId, step } = await ctx.params;
    const stepNumber = parseInt(step, 10);
    if (!isValidStatisticsMissionStep(stepNumber)) {
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

    // Students can edit; teachers can also edit for feedback purposes.
    // For students, check they belong to the section's team.
    if (student) {
      const membership = await db.breakoutMembership.findFirst({
        where: { sectionId, studentId: student.id },
      });
      if (!membership) {
        return NextResponse.json({ error: "not_your_team" }, { status: 403 });
      }
    }

    const body = await req.json();
    const input = PatchMissionSchema.parse(body);

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

    // Merge content deeply
    const mergedContent = {
      ...(existing.content as Record<string, unknown>),
      ...(input.content ?? {}),
    };

    const updated = await db.mission.update({
      where: { sectionId_stepNumber: { sectionId, stepNumber } },
      data: {
        content: mergedContent,
        status: existing.status === "not_started" ? "in_progress" : existing.status,
        version: { increment: 1 },
      },
    });

    return NextResponse.json({ mission: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PATCH /api/sections/:id/missions/:step]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
