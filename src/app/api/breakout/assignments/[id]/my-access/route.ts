/**
 * GET /api/breakout/assignments/[id]/my-access (BR-6)
 *
 * Returns the list of section ids + realtime channel keys the current caller
 * may subscribe to. Used by student clients so the server is the source of
 * truth for WS gating — the client never guesses which channels it can join.
 *
 *   Teacher (owner/editor) → all sections in the board
 *   Student own-only       → membership.sectionId + teacher-pool sections
 *   Student peek-others    → all group sections + teacher-pool sections
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import { sectionChannelKey, boardChannelKey } from "@/lib/realtime";

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const assignment = await db.breakoutAssignment.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!assignment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent(),
  ]);

  const sections = await db.section.findMany({
    where: { boardId: assignment.boardId },
    select: { id: true, title: true },
  });

  const sharedTitles = new Set<string>();
  const raw = assignment.template.structure as {
    sharedSections?: Array<{ title: string }>;
  } | null;
  if (raw?.sharedSections) for (const s of raw.sharedSections) sharedTitles.add(s.title);

  // Teacher path
  const role = user ? await getBoardRole(assignment.boardId, user.id) : null;
  if (role === "owner" || role === "editor") {
    const allowedSections = sections.map((s) => s.id);
    return NextResponse.json({
      role: "teacher",
      sectionIds: allowedSections,
      channels: [
        boardChannelKey(assignment.boardId),
        ...allowedSections.map((sid) => sectionChannelKey(assignment.boardId, sid)),
      ],
    });
  }

  // Student path
  if (!student) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const board = await db.board.findUnique({
    where: { id: assignment.boardId },
    select: { classroomId: true },
  });
  if (!board?.classroomId || student.classroomId !== board.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const visibility =
    (assignment.visibilityOverride as "own-only" | "peek-others" | null) ??
    (assignment.template.recommendedVisibility as "own-only" | "peek-others");

  const memberships = await db.breakoutMembership.findMany({
    where: { assignmentId: id, studentId: student.id },
    select: { sectionId: true },
  });
  const ownSectionIds = new Set(memberships.map((m) => m.sectionId));

  const allowed: string[] = [];
  for (const s of sections) {
    if (sharedTitles.has(s.title)) {
      allowed.push(s.id);
      continue;
    }
    if (visibility === "peek-others") {
      allowed.push(s.id);
      continue;
    }
    if (ownSectionIds.has(s.id)) allowed.push(s.id);
  }

  return NextResponse.json({
    role: "student",
    visibility,
    sectionIds: allowed,
    channels: allowed.map((sid) => sectionChannelKey(assignment.boardId, sid)),
  });
}
