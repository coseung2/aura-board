import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getPetHome } from "@/lib/pets/service";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isFeatureEnabled("petGame")) {
    return jsonPrivateNoStore({ error: "not_found" }, { status: 404 });
  }

  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  try {
    return jsonPrivateNoStore(await getPetHome(student));
  } catch (error) {
    console.error("[GET /api/student/pets]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
