import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { viewSection } from "@/lib/rbac";
import { ensureStatisticsMissions } from "@/lib/statistics/mission-server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
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

    await db.$transaction((tx) => ensureStatisticsMissions(tx, sectionId));

    const missions = await db.mission.findMany({
      where: { sectionId },
      orderBy: { stepNumber: "asc" },
    });

    return NextResponse.json({ missions });
  } catch (e) {
    console.error("[GET /api/sections/:id/missions]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
