import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { viewSection } from "@/lib/rbac";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ sectionId: string }> }
) {
  try {
    const { sectionId } = await ctx.params;
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

    const missions = await db.mission.findMany({
      where: { sectionId },
      orderBy: { stepNumber: "asc" },
    });

    // If no missions exist yet, seed them idempotently
    if (missions.length === 0) {
      const created = await db.$transaction(async (tx) => {
        const rows = [];
        for (let step = 1; step <= 11; step++) {
          rows.push(
            tx.mission.create({
              data: {
                sectionId,
                stepNumber: step,
                status: "not_started",
                content: {},
                version: 0,
              },
            })
          );
        }
        return Promise.all(rows);
      });
      return NextResponse.json({ missions: created });
    }

    return NextResponse.json({ missions });
  } catch (e) {
    console.error("[GET /api/sections/:id/missions]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
