import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await ctx.params;

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);

    if (!user && !student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { classroomId: true },
    });
    if (!board) {
      return NextResponse.json({ error: "board_not_found" }, { status: 404 });
    }

    // If a teacher creates the team, they must own the board
    if (user) {
      const role = await getBoardRole(boardId, user.id);
      if (!role) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    // If a student creates the team, they must belong to the board's classroom
    // and not already be in another team on this board
    let actingStudentId: string | null = null;
    if (student) {
      if (!board.classroomId || student.classroomId !== board.classroomId) {
        return NextResponse.json({ error: "not_classroom_student" }, { status: 403 });
      }
      actingStudentId = student.id;

      // Policy: one team per student per board
      const existingMembership = await db.breakoutMembership.findFirst({
        where: {
          studentId: student.id,
          section: { boardId },
        },
      });
      if (existingMembership) {
        return NextResponse.json(
          { error: "already_in_team", sectionId: existingMembership.sectionId },
          { status: 409 }
        );
      }
    }

    // Determine team name
    let teamName = "새 팀";
    if (actingStudentId) {
      const s = await db.student.findUnique({
        where: { id: actingStudentId },
        select: { name: true },
      });
      if (s) teamName = `팀 ${s.name}`;
    }

    // Create section + missions + membership in a transaction
    const result = await db.$transaction(async (tx) => {
      // Count existing sections for ordering
      const existingCount = await tx.section.count({ where: { boardId } });

      const section = await tx.section.create({
        data: {
          boardId,
          title: teamName,
          order: existingCount + 1,
        },
      });

      // Create 11 missions
      for (let step = 1; step <= 11; step++) {
        await tx.mission.create({
          data: {
            sectionId: section.id,
            stepNumber: step,
            status: "not_started",
            content: {},
            version: 0,
          },
        });
      }

      // If a student initiated, auto-join them
      if (actingStudentId) {
        await tx.breakoutMembership.create({
          data: {
            sectionId: section.id,
            studentId: actingStudentId,
          },
        });
      }

      return section;
    });

    return NextResponse.json({ sectionId: result.id, teamName: result.title });
  } catch (e) {
    console.error("[POST /api/boards/:id/teams]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
