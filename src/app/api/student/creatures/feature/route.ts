import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  featureBodySchema,
  featureCreature,
  isCreatureServiceError,
} from "@/lib/creatures/service";

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
  const parsed = featureBodySchema.safeParse(body);
  if (!parsed.success) return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });

  try {
    const result = await featureCreature(
      { id: student.id, classroomId: student.classroomId },
      parsed.data.creatureId,
    );
    return jsonPrivateNoStore(result);
  } catch (error) {
    if (isCreatureServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/creatures/feature] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
