import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";

export async function GET() {
  try {
    const user = await getCurrentUser().catch(() => null);
    if (user) {
      const classrooms = await db.classroom.findMany({
        where: { teacherId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          _count: { select: { students: true } },
        },
      });
      return jsonPrivateNoStore({
        classrooms: classrooms.map((classroom) => ({
          id: classroom.id,
          name: classroom.name,
          studentCount: classroom._count.students,
        })),
      });
    }

    const student = await getCurrentStudent();
    if (student) {
      return jsonPrivateNoStore({
        classrooms: [
          {
            id: student.classroomId,
            name: student.classroom.name,
            studentCount: null,
          },
        ],
      });
    }

    return jsonPrivateNoStore({ classrooms: [] }, { status: 401 });
  } catch (error) {
    console.error("[GET /api/toolkit/classrooms]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
