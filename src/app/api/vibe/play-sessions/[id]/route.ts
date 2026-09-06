// Vibe-arcade play session completion (Seed 13, AC-F5).
// PATCH: student reports completion (from iframe postMessage bridge).
// Server increments playCount + (conditional) uniquePlayCount.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { VibePlaySessionCompleteSchema } from "@/lib/vibe-arcade/types";

import { withProductFeature } from "@/lib/product-release-server";

export const PATCH = withProductFeature("developmentLayouts", PATCHHandler);
async function PATCHHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = VibePlaySessionCompleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const ps = await db.vibePlaySession.findUnique({ where: { id } });
  if (!ps || ps.studentId !== student.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (ps.completed) return NextResponse.json({ id: ps.id, completed: true });

  await db.$transaction(async (tx) => {
    await tx.vibePlaySession.update({
      where: { id },
      data: {
        completed: parsed.data.completed,
        endedAt: new Date(),
        reportedScore: parsed.data.reportedScore,
      },
    });

    // Increment aggregates on the project.
    await tx.vibeProject.update({
      where: { id: ps.projectId },
      data: { playCount: { increment: 1 } },
    });

    // uniquePlayCount: only bump if this student has no prior completed play.
    const priorCount = await tx.vibePlaySession.count({
      where: {
        projectId: ps.projectId,
        studentId: student.id,
        completed: true,
        NOT: { id: ps.id },
      },
    });
    if (priorCount === 0) {
      await tx.vibeProject.update({
        where: { id: ps.projectId },
        data: { uniquePlayCount: { increment: 1 } },
      });
    }
  });

  return NextResponse.json({ id, completed: true });
}
