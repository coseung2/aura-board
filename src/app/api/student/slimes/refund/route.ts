import { jsonPrivateNoStore } from "@/lib/http-cache";
import { isSlimeServiceError, refundSlime } from "@/lib/pets/service";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const color =
    body && typeof body === "object" && typeof (body as { color?: unknown }).color === "string"
      ? (body as { color: string }).color
      : null;
  if (!color) return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });

  try {
    return jsonPrivateNoStore(
      await refundSlime({ id: student.id, classroomId: student.classroomId }, color),
    );
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/refund] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
