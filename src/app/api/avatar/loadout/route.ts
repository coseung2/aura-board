import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { updateAvatarLoadout, type EquipsInput } from "@/lib/avatar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOADOUT_ERROR_STATUS: Record<string, number> = {
  unauthenticated: 401,
  not_owned: 403,
  slot_mismatch: 400,
  not_found: 404,
};

export async function PATCH(req: Request) {
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
  const raw = body as { equips?: unknown };
  if (!Array.isArray(raw.equips)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const equips: EquipsInput = [];
  for (const entry of raw.equips) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const e = entry as { slot?: unknown; itemId?: unknown };
    if (typeof e.slot !== "string" || e.slot.length === 0) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    if (e.itemId !== null && typeof e.itemId !== "string") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    equips.push({ slot: e.slot, itemId: e.itemId as string | null });
  }

  const result = await updateAvatarLoadout(student, equips);
  if (result.ok) {
    return NextResponse.json({ ok: true, equipped: result.equipped });
  }
  const status = LOADOUT_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json({ error: result.error }, { status });
}
