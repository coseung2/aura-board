import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAvailablePool } from "@/lib/feed/repository";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await listAvailablePool();
  return NextResponse.json({ items });
}
