import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { generateQrToken, generateTextCode } from "@/lib/classroom-utils";
import { jsonPrivateNoStore } from "@/lib/http-cache";

const StudentEntry = z.object({
  number: z.number().int().min(1),
  name: z.string().min(1).max(50),
});

const AddStudentsSchema = z.object({
  students: z.array(StudentEntry).min(1).max(50),
});

/**
 * GET /api/classroom/:id/students — roster for CardAuthorEditor.
 *
 * Access: classroom teacher (owner) OR student whose session is bound to
 * this classroom. Students outside the classroom get 403. Parents are
 * not recipients of this endpoint (they read child-scoped projections).
 *
 * student-author-edit (2026-04-20): added to support students editing
 * authors on their own cards — the picker needs same-classroom roster.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const classroom = await db.classroom.findUnique({
      where: { id },
      select: { id: true, teacherId: true },
    });
    if (!classroom) {
      return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
    }

    // Teacher path — owner of this classroom.
    let teacherOk = false;
    try {
      const user = await getCurrentUser();
      teacherOk = user?.id === classroom.teacherId;
    } catch {
      teacherOk = false;
    }

    // Student path — session bound to this classroom.
    let studentOk = false;
    if (!teacherOk) {
      const student = await getCurrentStudent();
      studentOk = !!student && student.classroomId === id;
    }

    if (!teacherOk && !studentOk) {
      return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
    }

    const students = await db.student.findMany({
      where: { classroomId: id },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: { id: true, name: true, number: true, gender: true },
    });

    return jsonPrivateNoStore({ students });
  } catch (e) {
    console.error("[GET /api/classroom/:id/students]", e);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;

    const classroom = await db.classroom.findUnique({ where: { id } });
    if (!classroom || classroom.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const input = AddStudentsSchema.parse(body);

    // Check for duplicate numbers within the request
    const numbers = input.students.map((s) => s.number);
    if (new Set(numbers).size !== numbers.length) {
      return NextResponse.json({ error: "중복된 번호가 있습니다" }, { status: 400 });
    }

    // Check for duplicate numbers in existing students
    const existing = await db.student.findMany({
      where: { classroomId: id, number: { in: numbers } },
      select: { number: true },
    });
    if (existing.length > 0) {
      const dupes = existing.map((s) => s.number).join(", ");
      return NextResponse.json(
        { error: `이미 존재하는 번호: ${dupes}` },
        { status: 409 }
      );
    }

    const studentsData = [];
    for (const entry of input.students) {
      const qrToken = generateQrToken();
      const textCode = await generateTextCode();
      studentsData.push({
        classroomId: id,
        number: entry.number,
        name: entry.name.trim(),
        qrToken,
        textCode,
      });
    }

    const students = await db.$transaction(
      studentsData.map((data) => db.student.create({ data }))
    );

    return NextResponse.json({ students }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/classroom/:id/students]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
