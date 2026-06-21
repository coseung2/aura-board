/**
 * POST /api/breakout/assignments/[id]/membership (BR-5)
 *
 * Creates a BreakoutMembership row. Supports two callers:
 *   - Student (self-select or link-fixed): uses cookie-resolved studentId,
 *     must target a section in the same assignment, must respect capacity.
 *   - Teacher (teacher-assign or manual adjust): must be board owner; may
 *     supply `studentId` explicitly.
 *
 * Body: { sectionId: string, studentId?: string, force?: boolean }
 *   - force (owner only): skip capacity check
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole, ForbiddenError } from "@/lib/rbac";

const Body = z.object({
  sectionId: z.string().min(1),
  studentId: z.string().min(1).optional(),
  force: z.boolean().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await ctx.params;

    const assignment = await db.breakoutAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [user, student] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentStudent(),
    ]);

    const body = await req.json();
    const input = Body.parse(body);

    // Resolve teacher-vs-student mode.
    const role = user ? await getBoardRole(assignment.boardId, user.id) : null;
    const isTeacher = role === "owner";

    let targetStudentId: string;
    if (isTeacher && input.studentId) {
      targetStudentId = input.studentId;
    } else if (student) {
      if (input.studentId && input.studentId !== student.id) {
        throw new ForbiddenError("student cannot impersonate");
      }
      targetStudentId = student.id;
    } else {
      throw new ForbiddenError("no identity");
    }

    // Section must belong to the same board as the assignment.
    const section = await db.section.findUnique({
      where: { id: input.sectionId },
      select: { id: true, boardId: true },
    });
    if (!section || section.boardId !== assignment.boardId) {
      return NextResponse.json({ error: "section_mismatch" }, { status: 400 });
    }

    // Student path must belong to the board's classroom.
    if (!isTeacher) {
      const board = await db.board.findUnique({
        where: { id: assignment.boardId },
        select: { classroomId: true },
      });
      if (!board?.classroomId || !student || student.classroomId !== board.classroomId) {
        throw new ForbiddenError("classroom mismatch");
      }
      // Student self-pick path: one membership per breakout assignment.
      // Link-fixed auto-join uses maybeAutoJoinLinkFixed, not this endpoint.
      const existing = await db.breakoutMembership.findFirst({
        where: { assignmentId, studentId: targetStudentId },
      });
      if (existing) {
        return NextResponse.json(
          { error: "already_selected", membership: existing },
          { status: 409 }
        );
      }
    }

    // Capacity gate — teacher `force=true` overrides.
    if (!(isTeacher && input.force)) {
      const count = await db.breakoutMembership.count({
        where: { assignmentId, sectionId: input.sectionId },
      });
      if (count >= assignment.groupCapacity) {
        return NextResponse.json({ error: "capacity_reached" }, { status: 400 });
      }
    }

    // Insert (respect @@unique([sectionId, studentId])).
    let membership;
    try {
      membership = await db.breakoutMembership.create({
        data: {
          assignmentId,
          sectionId: input.sectionId,
          studentId: targetStudentId,
        },
      });
    } catch {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }

    return NextResponse.json({ membership });
  } catch (e) {
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[POST /api/breakout/assignments/[id]/membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
