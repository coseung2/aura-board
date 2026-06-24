import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  loadClassroomDefaultGroups,
  saveClassroomDefaultGroups,
} from "@/lib/default-groups";

const SaveGroupsSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string().min(1).max(80),
      studentIds: z.array(z.string().min(1)),
    }),
  ),
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
        select: { id: true, name: true, number: true },
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
    const studentIds = new Set(
      (
        await db.student.findMany({
          where: { classroomId: id },
          select: { id: true },
        })
      ).map((student) => student.id),
    );
    const invalidStudentId = input.groups
      .flatMap((group) => group.studentIds)
      .find((studentId) => !studentIds.has(studentId));
    if (invalidStudentId) {
      return NextResponse.json(
        { error: "student_not_in_classroom", studentId: invalidStudentId },
        { status: 422 },
      );
    }

    await db.$transaction((tx) =>
      saveClassroomDefaultGroups(tx, id, input.groups),
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
