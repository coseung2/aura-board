import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { db } from "@/lib/db";
import { getStudentDuties } from "@/lib/role-portals";

export async function GET() {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [boards, duties] = await Promise.all([
      db.board.findMany({
        where: { classroomId: student.classroomId },
        select: {
          id: true,
          slug: true,
          title: true,
          layout: true,
          anonymousAuthor: true,
          thumbnailMode: true,
          thumbnailUrl: true,
          boardTheme: true,
          streamSectionsEnabled: true,
          _count: { select: { cards: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      getStudentDuties(student.id),
    ]);

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        classroom: student.classroom
          ? { id: student.classroom.id, name: student.classroom.name }
          : null,
      },
      boards,
      duties,
    });
  } catch (e) {
    console.error("[GET /api/student/me]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
