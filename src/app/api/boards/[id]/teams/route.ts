import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";
import { STATISTICS_MISSION_COUNT } from "@/lib/statistics/mission-constants";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await ctx.params;
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const membership = await db.breakoutMembership.findFirst({
      where: {
        studentId: student.id,
        section: { boardId },
      },
      include: {
        section: {
          select: {
            id: true,
            title: true,
            breakoutMemberships: {
              include: {
                student: {
                  select: { id: true, name: true, number: true },
                },
              },
              orderBy: { joinedAt: "asc" },
            },
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ sectionId: null, teamName: null, teamMembers: [] });
    }

    return NextResponse.json({
      sectionId: membership.section.id,
      teamName: membership.section.title,
      teamMembers: membership.section.breakoutMemberships.map((item) => ({
        id: item.id,
        studentId: item.studentId,
        studentName: item.student.name,
        studentNumber: item.student.number,
      })),
    });
  } catch (e) {
    console.error("[GET /api/boards/:id/teams]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: boardId } = await ctx.params;

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

    let actingStudentId: string | null = null;

    if (student) {
      if (!board.classroomId || student.classroomId !== board.classroomId) {
        return NextResponse.json({ error: "not_classroom_student" }, { status: 403 });
      }
      actingStudentId = student.id;
    }

    if (user) {
      const role = await getBoardRole(boardId, user.id);
      if (!role) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      if (!actingStudentId) {
        const body = await req.json().catch(() => ({}));
        const { studentId } = body;
        if (typeof studentId === "string" && studentId) {
          if (!board.classroomId) {
            return NextResponse.json({ error: "board_has_no_classroom" }, { status: 400 });
          }
          const targetStudent = await db.student.findUnique({
            where: { id: studentId },
            select: { id: true, classroomId: true, name: true },
          });
          if (!targetStudent) {
            return NextResponse.json({ error: "student_not_found" }, { status: 404 });
          }
          if (targetStudent.classroomId !== board.classroomId) {
            return NextResponse.json({ error: "student_not_in_classroom" }, { status: 403 });
          }
          actingStudentId = targetStudent.id;
        }
      }
    }

    if (actingStudentId) {
      const existingMembership = await db.breakoutMembership.findFirst({
        where: {
          studentId: actingStudentId,
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

    let teamName = "새 팀";
    if (actingStudentId) {
      const s = await db.student.findUnique({
        where: { id: actingStudentId },
        select: { name: true },
      });
      if (s) teamName = `팀 ${s.name}`;
    }

    const result = await db.$transaction(async (tx) => {
      const existingCount = await tx.section.count({ where: { boardId } });

      const section = await tx.section.create({
        data: {
          boardId,
          title: teamName,
          order: existingCount + 1,
        },
      });

      for (let step = 1; step <= STATISTICS_MISSION_COUNT; step++) {
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
