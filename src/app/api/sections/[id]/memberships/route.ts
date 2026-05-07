import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);
    if (!user && !student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const section = await db.section.findUnique({ where: { id: sectionId }, select: { boardId: true } });
    if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

    let canRead = false;
    if (user) {
      const role = await getBoardRole(section.boardId, user.id);
      if (role) canRead = true;
    }
    if (student && !canRead) {
      const membership = await db.breakoutMembership.findUnique({
        where: { sectionId_studentId: { sectionId, studentId: student.id } },
      });
      if (membership) canRead = true;
    }
    if (!canRead) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const memberships = await db.breakoutMembership.findMany({
      where: { sectionId },
      include: { student: { select: { id: true, name: true, number: true } } },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({
      memberships: memberships.map((m) => ({
        id: m.id,
        studentId: m.studentId,
        studentName: m.student.name,
        studentNumber: m.student.number,
      })),
    });
  } catch (e) {
    console.error("[GET memberships]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);

    const section = await db.section.findUnique({
      where: { id: sectionId },
      select: { boardId: true, board: { select: { classroomId: true } } },
    });
    if (!section) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Permission check:
    // - Teachers with board role can invite anyone
    // - Students can invite only if they are already a member of this section
    let canInvite = false;
    if (user) {
      const role = await getBoardRole(section.boardId, user.id);
      if (role) canInvite = true;
    }
    if (student && !canInvite) {
      const membership = await db.breakoutMembership.findUnique({
        where: { sectionId_studentId: { sectionId, studentId: student.id } },
      });
      if (membership) canInvite = true;
    }
    if (!canInvite) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { studentId } = body;
    const replaceExisting = body.replaceExisting === true;
    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    if (!section.board.classroomId) {
      return NextResponse.json({ error: "board_has_no_classroom" }, { status: 400 });
    }

    const targetStudent = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true, classroomId: true },
    });
    if (!targetStudent) {
      return NextResponse.json({ error: "student_not_found" }, { status: 404 });
    }
    if (targetStudent.classroomId !== section.board.classroomId) {
      return NextResponse.json({ error: "student_not_in_classroom" }, { status: 403 });
    }

    // Check if target student is already in this section
    const existingInSection = await db.breakoutMembership.findUnique({
      where: { sectionId_studentId: { sectionId, studentId } },
    });
    if (existingInSection) {
      return NextResponse.json({ error: "already_assigned" }, { status: 409 });
    }

    // Policy: one team per student per board
    const existingInBoard = await db.breakoutMembership.findFirst({
      where: {
        studentId,
        section: { boardId: section.boardId },
      },
      include: {
        section: {
          select: { id: true },
        },
      },
    });
    if (existingInBoard) {
      if (!replaceExisting) {
        return NextResponse.json(
          {
            error: "already_in_another_team",
            currentSectionId: existingInBoard.sectionId,
          },
          { status: 409 }
        );
      }
    }

    const membership = await db.$transaction(async (tx) => {
      if (existingInBoard) {
        await tx.breakoutMembership.delete({
          where: {
            sectionId_studentId: {
              sectionId: existingInBoard.sectionId,
              studentId,
            },
          },
        });

        const remainingCount = await tx.breakoutMembership.count({
          where: { sectionId: existingInBoard.sectionId },
        });
        if (remainingCount === 0) {
          await tx.section.delete({ where: { id: existingInBoard.sectionId } });
        }
      }

      return tx.breakoutMembership.create({
        data: { sectionId, studentId },
        include: { student: { select: { id: true, name: true, number: true } } },
      });
    });

    return NextResponse.json({
      membership: {
        id: membership.id,
        studentId: membership.studentId,
        studentName: membership.student.name,
        studentNumber: membership.student.number,
      },
    });
  } catch (e) {
    console.error("[POST membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
