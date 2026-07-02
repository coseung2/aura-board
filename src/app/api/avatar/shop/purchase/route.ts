import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { purchaseAvatarItem } from "@/lib/avatar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PURCHASE_ERROR_STATUS: Record<string, number> = {
  unauthenticated: 401,
  not_found: 404,
  archived: 410,
  already_owned: 409,
  insufficient_funds: 402,
  forbidden: 403,
  invalid_body: 400,
};

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const raw = body as { itemId?: unknown };
  if (typeof raw.itemId !== "string" || raw.itemId.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await purchaseAvatarItem(student, raw.itemId);
  if (result.ok) {
    return NextResponse.json(
      {
        ok: true,
        balance: result.balance,
        inventoryItemIds: result.inventoryItemIds,
      },
      { status: 200 },
    );
  }
  const status = PURCHASE_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json({ error: result.error }, { status });
}
