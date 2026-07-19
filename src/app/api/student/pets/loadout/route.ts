import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { petErrorResponse, replaceLoadout } from "@/lib/pets/service";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!isFeatureEnabled("petGame")) {
    return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
  }

  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch {
    return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
  }
  const petIds = body && typeof body === "object" && Array.isArray((body as { petIds?: unknown }).petIds)
    ? (body as { petIds: unknown[] }).petIds : null;
  if (!petIds || petIds.some((id) => typeof id !== "string")) {
    return jsonPrivateNoStore({ error: "invalid_pet_ids" }, { status: 400 });
  }
  try {
    return jsonPrivateNoStore({ home: await replaceLoadout(student, petIds as string[]) });
  } catch (error) {
    const known = petErrorResponse(error);
    if (known) return jsonPrivateNoStore(known.body, { status: known.status });
    console.error("[PATCH /api/student/pets/loadout]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
