import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { consumeNotificationOutbox } from "@/lib/notification-outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function consume(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  const result = await consumeNotificationOutbox({
    batchSize: 50,
    concurrency: 5,
  });
  return NextResponse.json(result);
}

export const GET = consume;
export const POST = consume;
