import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { processNextReadingFeedback } from "@/lib/reading-feedback-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 70;

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await processNextReadingFeedback();
  return NextResponse.json({ ok: true, ...result });
}
