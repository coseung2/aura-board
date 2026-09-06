import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";

/**
 * Bootstrap endpoint for AssessmentBoard. Given a boardId, returns the
 * first AssessmentTemplate anchored to that board plus — for a student
 * viewer — their current submission id and submit status. Teachers get
 * the templateId only; they don't take the quiz.
 *
 * MVP-0 assumes a single template per board (the first one wins). The
 * multi-template picker is MVP-1.
 */
import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const ids = await resolveIdentities();

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      classroomId: true,
      classroom: { select: { teacherId: true } },
      members: { where: { role: "owner" }, select: { userId: true } },
    },
  });
  if (!board) return NextResponse.json({ error: "board_not_found" }, { status: 404 });

  const template = await db.assessmentTemplate.findFirst({
    where: { boardId },
    orderBy: { createdAt: "desc" },
    select: { id: true, classroomId: true },
  });

  // Teacher gate — check classroom.teacherId OR board member owner.
  if (ids.teacher) {
    const isOwner =
      board.classroom?.teacherId === ids.teacher.userId ||
      board.members.some((m) => m.userId === ids.teacher!.userId);
    if (!isOwner) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({
      templateId: template?.id ?? null,
      classroomId: board.classroomId,
      submissionId: null,
      submitted: false,
      viewer: "teacher",
    });
  }

  // Student gate.
  if (ids.student) {
    if (board.classroomId !== ids.student.classroomId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!template) {
      return NextResponse.json({
        templateId: null,
        submissionId: null,
        submitted: false,
        viewer: "student",
      });
    }
    const submission = await db.assessmentSubmission.findUnique({
      where: {
        templateId_studentId: {
          templateId: template.id,
          studentId: ids.student.studentId,
        },
      },
      select: { id: true, status: true },
    });
    return NextResponse.json({
      templateId: template.id,
      submissionId: submission?.id ?? null,
      submitted: submission?.status === "submitted",
      viewer: "student",
    });
  }

  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
