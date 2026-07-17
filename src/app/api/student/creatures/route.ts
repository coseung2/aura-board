import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getStudentCreatures, isCreatureServiceError } from "@/lib/creatures/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  try {
    return jsonPrivateNoStore(await getStudentCreatures({ id: student.id, classroomId: student.classroomId }));
  } catch (error) {
    if (isCreatureServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/creatures] GET failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
