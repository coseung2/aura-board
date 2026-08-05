import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getSlimeHome, isSlimeServiceError } from "@/lib/pets/service";
import { slimeHomeForMobileClient } from "@/lib/pets/mobile-catalog-compat";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  try {
    const home = await getSlimeHome({ id: student.id, classroomId: student.classroomId });
    const bearerClient = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;
    return jsonPrivateNoStore(
      slimeHomeForMobileClient(home, {
        bearerClient,
        capabilityHeader: request.headers.get("x-aura-mobile-capabilities"),
      }),
    );
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes] GET failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
