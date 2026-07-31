// Vibe-arcade teacher moderation action (Seed 13, AC-F12).
// POST: owner/editor approves or rejects a project. Updates moderationStatus + publishes realtime.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";
import { scheduleRealtimePublish } from "@/lib/realtime-server";
import { VibeModerationActionSchema } from "@/lib/vibe-arcade/types";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = await db.vibeProject.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getBoardRole(project.boardId, user.id);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = VibeModerationActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { action, note } = parsed.data;

  if (action === "reject" && !note) {
    return NextResponse.json({ error: "note_required_for_reject" }, { status: 400 });
  }

  const now = new Date();
  const updated = await db.vibeProject.update({
    where: { id: projectId },
    data:
      action === "approve"
        ? {
            moderationStatus: "approved",
            approvedAt: now,
            approvedById: user.id,
            rejectedAt: null,
            rejectedById: null,
            moderationNote: null,
          }
        : {
            moderationStatus: "rejected",
            rejectedAt: now,
            rejectedById: user.id,
            moderationNote: note ?? "",
          },
  });

  scheduleRealtimePublish({
    channel: `board:${project.boardId}:vibe-arcade`,
    type: action === "approve" ? "project.approved" : "project.rejected",
    payload: { projectId: updated.id, boardId: project.boardId, note: updated.moderationNote },
  });

  await logAudit({
    actorType: "teacher",
    actorId: user.id,
    action: `vibe.moderation.${action}`,
    resourceType: "vibe_project",
    resourceId: projectId,
    metadata: {
      boardId: project.boardId,
      note: updated.moderationNote,
      previousStatus: project.moderationStatus,
      newStatus: updated.moderationStatus,
    },
    req,
  });

  return NextResponse.json({ id: updated.id, moderationStatus: updated.moderationStatus });
}
