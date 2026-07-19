import { jsonPrivateNoStore } from "@/lib/http-cache";
import { isSlimeServiceError, purchaseSlime } from "@/lib/pets/service";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }
  const color =
    body && typeof body === "object" && typeof (body as { color?: unknown }).color === "string"
      ? (body as { color: string }).color
      : null;
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!color || !idempotencyKey) {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await purchaseSlime(
      { id: student.id, classroomId: student.classroomId },
      color,
      idempotencyKey,
    );
    return jsonPrivateNoStore(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/purchase] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
