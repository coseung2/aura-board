import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth-only";
import { getDailyBanner, getKstDay } from "@/lib/daily-banner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

// GET /api/parent/daily-banner/current
// The publication is platform-global, so a valid parent session is enough;
// no childId is needed and no specific classroom is selected.
export async function GET(req: Request) {
  const response = await withParentAuth(req, async () => {
    const day = getKstDay();
    const banner = await getDailyBanner(day);
    return NextResponse.json(
      { day, banner },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  });
  response.headers.set("Cache-Control", PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Vary", PRIVATE_NO_STORE_HEADERS.Vary);
  return response;
}
