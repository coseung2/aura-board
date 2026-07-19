import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { hatchEgg, petErrorResponse } from "@/lib/pets/service";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ eggId: string }> }) {
  if (!isFeatureEnabled("petGame")) {
    return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
  }

  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const { eggId } = await context.params;
  try {
    return jsonPrivateNoStore(await hatchEgg(student, eggId));
  } catch (error) {
    const known = petErrorResponse(error);
    if (known) return jsonPrivateNoStore(known.body, { status: known.status });
    console.error("[POST /api/student/pets/eggs/:eggId/hatch]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
