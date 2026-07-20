import { jsonPrivateNoStore } from "@/lib/http-cache";
import { isSlimeServiceError, refundSlimeShopItem } from "@/lib/pets/service";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) return jsonPrivateNoStore({ error: "unauthenticated" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const itemKey =
    body && typeof body === "object" && typeof (body as { itemKey?: unknown }).itemKey === "string"
      ? (body as { itemKey: string }).itemKey
      : null;
  if (!itemKey) return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });

  try {
    return jsonPrivateNoStore(
      await refundSlimeShopItem(
        { id: student.id, classroomId: student.classroomId },
        itemKey,
      ),
    );
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/items/refund] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
