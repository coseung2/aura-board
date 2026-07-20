import { jsonPrivateNoStore } from "@/lib/http-cache";
import { equipSlime, isSlimeServiceError } from "@/lib/pets/service";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Toggle one owned slime and return the complete recalculated growth payload. */
export async function POST(req: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }

  const objectBody = body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : null;
  const color = typeof objectBody?.color === "string"
    ? objectBody.color
    : typeof objectBody?.slimeColor === "string"
      ? objectBody.slimeColor
      : null;
  const rawEquipped = objectBody?.isEquipped ?? objectBody?.equipped;
  if (!color || typeof rawEquipped !== "boolean") {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await equipSlime(
      { id: student.id, classroomId: student.classroomId },
      color,
      rawEquipped,
    );
    return jsonPrivateNoStore(result, { status: 200 });
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/equip] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
