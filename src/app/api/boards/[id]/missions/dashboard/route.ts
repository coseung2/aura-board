import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";
import { STATISTICS_MISSION_COUNT } from "@/lib/statistics/mission-constants";
import { ensureStatisticsMissions } from "@/lib/statistics/mission-server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await ctx.params;
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const role = await getBoardRole(boardId, user.id);
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true },
    });

    const sectionIds = await db.section.findMany({
      where: { boardId },
      select: { id: true },
    });

    await db.$transaction(async (tx) => {
      for (const section of sectionIds) {
        await ensureStatisticsMissions(tx, section.id);
      }
    });

    const sections = await db.section.findMany({
      where: { boardId },
      orderBy: { order: "asc" },
      include: {
        missions: { orderBy: { stepNumber: "asc" } },
        _count: { select: { breakoutMemberships: true } },
      },
    });

    const teams = sections.map((section) => {
      const currentMission = section.missions.find(
        (m) => m.status !== "approved" && m.status !== "completed"
      );
      return {
        sectionId: section.id,
        teamName: section.title,
        memberCount: section._count.breakoutMemberships,
        currentStep: currentMission?.stepNumber ?? STATISTICS_MISSION_COUNT,
        missions: section.missions.map((m) => ({
          id: m.id,
          sectionId: m.sectionId,
          stepNumber: m.stepNumber,
          status: m.status,
          content: m.content,
          submittedAt: m.submittedAt?.toISOString() ?? null,
          approvedAt: m.approvedAt?.toISOString() ?? null,
          approvedBy: m.approvedBy,
          teacherFeedback: m.teacherFeedback,
          version: m.version,
        })),
      };
    });

    let roster: Array<{ id: string; name: string; number: number | null }> = [];
    if (board?.classroomId) {
      const students = await db.student.findMany({
        where: { classroomId: board.classroomId },
        orderBy: [{ number: "asc" }, { name: "asc" }],
        select: { id: true, name: true, number: true },
      });
      roster = students;
    }

    return NextResponse.json({
      teams,
      sections: sections.map((s) => ({ id: s.id, title: s.title, order: s.order })),
      roster,
    });
  } catch (e) {
    console.error("[GET /api/boards/:id/missions/dashboard]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
