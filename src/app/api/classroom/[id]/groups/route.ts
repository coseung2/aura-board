import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  loadClassroomDefaultGroups,
  saveClassroomDefaultGroups,
} from "@/lib/default-groups";
import { isSeatingExcludedStudent } from "@/lib/seating-exclusions";

const SaveGroupsSchema = z.object({
  groups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        studentIds: z.array(z.string().min(1)),
      }),
    )
    .min(1),
});

async function requireClassroom(id: string, userId: string) {
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, teacherId: true },
  });
  if (!classroom || classroom.teacherId !== userId) return null;
  return classroom;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const classroom = await requireClassroom(id, user.id);
    if (!classroom) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [students, groups] = await Promise.all([
      db.student.findMany({
        where: { classroomId: id },
        orderBy: [{ number: "asc" }, { name: "asc" }],
        select: { id: true, name: true, number: true, gender: true },
      }),
      loadClassroomDefaultGroups(db, id),
    ]);

    return NextResponse.json({ students, groups });
  } catch (e) {
    console.error("[GET /api/classroom/:id/groups]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const classroom = await requireClassroom(id, user.id);
    if (!classroom) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const input = SaveGroupsSchema.parse(body);
    const classroomStudents = await db.student.findMany({
      where: { classroomId: id },
      select: { id: true, name: true },
    });
    const seatingStudents = classroomStudents.filter(
      (student) => !isSeatingExcludedStudent(student),
    );
    const studentIds = new Set(seatingStudents.map((student) => student.id));
    const assignedIds = input.groups.flatMap((group) => group.studentIds);
    const emptyGroupIndex = input.groups.findIndex(
      (group) => group.studentIds.length === 0,
    );
    if (emptyGroupIndex >= 0) {
      return NextResponse.json(
        { error: "empty_group", groupIndex: emptyGroupIndex },
        { status: 422 },
      );
    }
    const invalidStudentId = assignedIds.find(
      (studentId) => !studentIds.has(studentId),
    );
    if (invalidStudentId) {
      return NextResponse.json(
        { error: "student_not_in_classroom", studentId: invalidStudentId },
        { status: 422 },
      );
    }
    const duplicateStudentId = assignedIds.find(
      (studentId, index) => assignedIds.indexOf(studentId) !== index,
    );
    if (duplicateStudentId) {
      return NextResponse.json(
        { error: "duplicate_student", studentId: duplicateStudentId },
        { status: 422 },
      );
    }
    // Saving here only updates the classroom's own arrangement. Boards take a
    // snapshot of it when they are created or linked
    // (snapshotClassroomGroupsToBoard), so existing boards and stream breakout
    // sections are intentionally left untouched (2026-07-27).
    await db.$transaction(
      async (tx) => {
        await saveClassroomDefaultGroups(tx, id, input.groups);
      },
      { timeout: 30_000 },
    );
    const groups = await loadClassroomDefaultGroups(db, id);
    return NextResponse.json({ groups });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[PUT /api/classroom/:id/groups]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
