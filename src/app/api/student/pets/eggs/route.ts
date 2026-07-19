import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { buyEgg, petErrorResponse } from "@/lib/pets/service";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isFeatureEnabled("petGame")) {
    return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
  }

  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
  }
  const eggType = body && typeof body === "object" && typeof (body as { eggType?: unknown }).eggType === "string"
    ? (body as { eggType: string }).eggType : "";
  try {
    return jsonPrivateNoStore({ home: await buyEgg(student, eggType) }, { status: 201 });
  } catch (error) {
    const known = petErrorResponse(error);
    if (known) return jsonPrivateNoStore(known.body, { status: known.status });
    console.error("[POST /api/student/pets/eggs]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
