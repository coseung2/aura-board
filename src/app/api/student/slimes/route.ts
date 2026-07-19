import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getSlimeHome, isSlimeServiceError } from "@/lib/pets/service";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  try {
    return jsonPrivateNoStore(
      await getSlimeHome({ id: student.id, classroomId: student.classroomId }),
    );
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes] GET failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
