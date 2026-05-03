import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await ctx.params;
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const role = await getBoardRole(boardId, user.id);
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

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
        currentStep: currentMission?.stepNumber ?? 11,
        missions: section.missions.map((m) => ({
          stepNumber: m.stepNumber,
          status: m.status,
          submittedAt: m.submittedAt?.toISOString() ?? null,
          approvedAt: m.approvedAt?.toISOString() ?? null,
        })),
      };
    });

    return NextResponse.json({ teams });
  } catch (e) {
    console.error("[GET /api/boards/:id/missions/dashboard]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
