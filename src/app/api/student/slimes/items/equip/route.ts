import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  equipSlimeShopItem,
  isSlimeServiceError,
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
  const slimeColor =
    body && typeof body === "object" && typeof (body as { slimeColor?: unknown }).slimeColor === "string"
      ? (body as { slimeColor: string }).slimeColor
      : null;
  const rawEquipped =
    body && typeof body === "object"
      ? (body as { isEquipped?: unknown; equipped?: unknown }).isEquipped ??
        (body as { equipped?: unknown }).equipped
      : undefined;
  const isEquipped = typeof rawEquipped === "boolean" ? rawEquipped : null;
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!slimeColor || !itemKey || isEquipped === null || !idempotencyKey) {
    return jsonPrivateNoStore({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await equipSlimeShopItem(
      { id: student.id, classroomId: student.classroomId },
      slimeColor,
      itemKey,
      isEquipped,
      idempotencyKey,
    );
    return jsonPrivateNoStore(result, { status: 200 });
  } catch (error) {
    if (isSlimeServiceError(error)) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[student/slimes/items/equip] POST failed", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
