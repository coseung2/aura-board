import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  isSlimeServiceError,
  purchaseSlimeShopItem,
} from "@/lib/pets/service";
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

  const itemKey =
    body && typeof body === "object" && typeof (body as { itemKey?: unknown }).itemKey === "string"
      ? (body as { itemKey: string }).itemKey
      : null;
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!itemKey || !idempotencyKey) {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await purchaseSlimeShopItem(
      { id: student.id, classroomId: student.classroomId },
      itemKey,
      idempotencyKey,
    );
    return jsonPrivateNoStore(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/items/purchase] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
