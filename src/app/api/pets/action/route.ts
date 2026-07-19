import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  getPetHome,
  performPetAction,
  type PetActionInput,
} from "@/lib/pets/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERROR_STATUS: Record<string, number> = {
  invalid_body: 400,
  pet_not_found: 404,
  lineage_not_found: 404,
  item_not_found: 404,
  item_not_owned: 409,
  wrong_item_kind: 400,
  not_ready: 409,
  invalid_name: 400,
};

const readAction = (body: unknown): PetActionInput | null => {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.action !== "string" || typeof raw.petId !== "string" || !raw.petId.trim()) return null;
  const petId = raw.petId.trim();

  if (raw.action === "feed" || raw.action === "accelerate") {
    if (typeof raw.itemKey !== "string" || !raw.itemKey.trim()) return null;
    return { action: raw.action, petId, itemKey: raw.itemKey.trim() };
  }
  if (raw.action === "evolve" || raw.action === "equip") {
    return { action: raw.action, petId };
  }
  if (raw.action === "set-background") {
    if (raw.itemKey !== null && typeof raw.itemKey !== "string") return null;
    return { action: "set-background", petId, itemKey: typeof raw.itemKey === "string" ? raw.itemKey.trim() || null : null };
  }
  if (raw.action === "rename") {
    if (raw.nickname !== null && typeof raw.nickname !== "string") return null;
    return { action: "rename", petId, nickname: typeof raw.nickname === "string" ? raw.nickname : null };
  }
  return null;
};

export async function POST(request: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input = readAction(body);
  if (!input) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await performPetAction(student, input);
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] ?? 400 });
  }
  return NextResponse.json({
    ok: true,
    event: result.event,
    petId: result.petId,
    home: await getPetHome(student),
  });
}
