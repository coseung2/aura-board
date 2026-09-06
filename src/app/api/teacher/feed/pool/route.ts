import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAvailablePool } from "@/lib/feed/repository";

export const runtime = "nodejs";

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("feed", GETHandler);
async function GETHandler() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await listAvailablePool();
  return NextResponse.json({ items });
}
