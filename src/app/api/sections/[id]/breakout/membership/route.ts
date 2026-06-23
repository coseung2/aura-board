// POST /api/sections/[id]/breakout/membership
//
// Student self-pick endpoint. The caller must be a student in the same
// classroom as the section's board. Body: { groupId }.
//   - groupId must belong to the section
//   - groupId must have free capacity (config.groupCapacity) - 409 otherwise
//   - upsert the (sectionId, studentId) row, so re-picking is a single call
// Response is the same shape as GET /api/sections/[id]/breakout so the
// client can refresh its snapshot in one go.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole, ForbiddenError } from "@/lib/rbac";
import { loadSnapshot } from "../route";

const Body = z.object({
  groupId: z.string().min(1),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sectionId } = await ctx.params;
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "student_only" }, { status: 403 });
    }

    const section = await db.section.findUnique({
      where: { id: sectionId },
      select: { id: true, boardId: true },
    });
    if (!section) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // getEffectiveBoardRole resolves teacher / classroom-role-grant /
    // classroom-student baseline. For the student self-pick path we want
    // a real student identity, so we verify classroom match ourselves.
    const role = await getEffectiveBoardRole(section.boardId, {
      studentId: student.id,
    });
    if (!role) {
      throw new ForbiddenError("forbidden");
    }

    const board = await db.board.findUnique({
      where: { id: section.boardId },
      select: { classroomId: true },
    });
    if (!board?.classroomId || board.classroomId !== student.classroomId) {
      throw new ForbiddenError("classroom_mismatch");
    }

    const body = await req.json().catch(() => ({}));
    const input = Body.parse(body);

    const group = await db.sectionBreakoutGroup.findUnique({
      where: { id: input.groupId },
      select: { id: true, sectionId: true },
    });
    if (!group || group.sectionId !== sectionId) {
      return NextResponse.json({ error: "group_mismatch" }, { status: 422 });
    }

    // Capacity check. groupCapacity is nullable (null = unlimited).
    const config = await db.sectionBreakoutConfig.findUnique({
      where: { sectionId },
      select: { groupCapacity: true },
    });
    if (config && config.groupCapacity != null) {
      const existing = await db.sectionBreakoutMembership.findUnique({
        where: { sectionId_studentId: { sectionId, studentId: student.id } },
        select: { groupId: true },
      });
      // No-op self-pick (already in this group) is allowed even at full
      // capacity; any new occupant, including a first-time pick, is gated.
      if (!existing || existing.groupId !== group.id) {
        const count = await db.sectionBreakoutMembership.count({
          where: { groupId: group.id },
        });
        if (count >= config.groupCapacity) {
          return NextResponse.json({ error: "group_full" }, { status: 409 });
        }
      }
    }

    // upsert keyed on (sectionId, studentId). Prisma's compound unique
    // sectionId_studentId makes this the canonical "one group per
    // student per section" enforcement.
    await db.sectionBreakoutMembership.upsert({
      where: { sectionId_studentId: { sectionId, studentId: student.id } },
      create: { sectionId, groupId: group.id, studentId: student.id },
      update: { groupId: group.id },
    });

    const snapshot = await loadSnapshot(sectionId, {
      callerRole: role,
      studentId: student.id,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[POST section breakout membership]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
