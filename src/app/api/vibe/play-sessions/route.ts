// Vibe-arcade play session creation (Seed 13, AC-F5 / AC-F11 / AC-G1).
// POST: student starts a play session, server issues JWT playToken for sandbox route.

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { issuePlayToken } from "@/lib/vibe-arcade/play-token";

const CreateSchema = z.object({ projectId: z.string().min(1) });

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(req: Request) {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const project = await db.vibeProject.findUnique({ where: { id: parsed.data.projectId } });
  if (!project || project.moderationStatus !== "approved") {
    return NextResponse.json({ error: "not_playable" }, { status: 404 });
  }

  // Scope check — same classroom (cross-classroom gated by VibeArcadeConfig).
  if (project.classroomId !== student.classroomId) {
    const cfg = await db.vibeArcadeConfig.findUnique({ where: { boardId: project.boardId } });
    if (!cfg?.crossClassroomVisible) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const playSession = await db.vibePlaySession.create({
    data: {
      projectId: project.id,
      studentId: student.id,
    },
  });

  const playToken = issuePlayToken(project.id, playSession.id);
  return NextResponse.json({ id: playSession.id, playToken });
}
