import { NextResponse } from "next/server";
import { processBlobDeletionQueue } from "@/lib/blob-cleanup";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await processBlobDeletionQueue(25);
  return NextResponse.json({ ok: true, ...result });
}
