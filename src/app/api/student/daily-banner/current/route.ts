import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { getDailyBanner, getKstDay } from "@/lib/daily-banner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

// GET /api/student/daily-banner/current
export async function GET() {
  const student = await getCurrentStudent().catch(() => null);
  if (!student) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const day = getKstDay();
  const banner = await getDailyBanner(day);
  return NextResponse.json(
    { day, banner },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}
