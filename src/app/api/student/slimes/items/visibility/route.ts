import { jsonPrivateNoStore } from "@/lib/http-cache";
import { isSlimeServiceError, setSlimeShopItemHidden } from "@/lib/pets/service";
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
  const value = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const slimeColor = typeof value?.slimeColor === "string" ? value.slimeColor : null;
  const itemKey = typeof value?.itemKey === "string" ? value.itemKey : null;
  const isHidden = typeof value?.isHidden === "boolean" ? value.isHidden : null;
  if (!slimeColor || !itemKey || isHidden === null) {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await setSlimeShopItemHidden(
      { id: student.id, classroomId: student.classroomId },
      slimeColor,
      itemKey,
      isHidden,
    );
    return jsonPrivateNoStore(result, { status: 200 });
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/items/visibility] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
