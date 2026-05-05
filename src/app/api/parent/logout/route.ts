import { NextResponse } from "next/server";
import { clearParentSession } from "@/lib/parent-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearParentSession();
  return NextResponse.json({ ok: true });
}
