import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getClassroomCreatureRoster } from "@/lib/creatures/classroom-roster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/student/creatures/classroom — authenticated student's class pets. */
export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });

  try {
    return jsonPrivateNoStore(
      await getClassroomCreatureRoster({ id: student.id, classroomId: student.classroomId }),
    );
  } catch (error) {
    console.error("[student/creatures/classroom] GET failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}

