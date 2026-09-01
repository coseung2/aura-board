import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { consumeNotificationOutbox } from "@/lib/notification-outbox";
import { runMorningAttendanceReminder } from "../attendance-reminder/route";
import { runAfternoonAttendanceReminder } from "../afternoon-attendance-reminder/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 100;
const MAX_BATCHES_PER_WAKEUP = 10;
const MAX_DRAIN_MS = 20_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function scheduledAttendanceSlot(now = new Date()): "morning" | "afternoon" | null {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  if (hour === 7 && minute === 50) return "morning";
  if (hour === 17 && minute === 0) return "afternoon";
  return null;
}

async function consume(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  const attendanceSlot = scheduledAttendanceSlot();
  const attendance = attendanceSlot === "morning"
    ? await runMorningAttendanceReminder()
    : attendanceSlot === "afternoon"
      ? await runAfternoonAttendanceReminder()
      : null;

  const startedAt = Date.now();
  const total = {
    batches: 0,
    claimed: 0,
    processed: 0,
    retried: 0,
    dead: 0,
    hasMore: false,
  };

  while (
    total.batches < MAX_BATCHES_PER_WAKEUP &&
    Date.now() - startedAt < MAX_DRAIN_MS
  ) {
    const result = await consumeNotificationOutbox({
      batchSize: BATCH_SIZE,
      concurrency: 5,
    });
    total.batches += 1;
    total.claimed += result.claimed;
    total.processed += result.processed;
    total.retried += result.retried;
    total.dead += result.dead;
    if (result.claimed < BATCH_SIZE) {
      total.hasMore = false;
      break;
    }
    total.hasMore = true;
  }

  return NextResponse.json({ ...total, attendanceSlot, attendance });
}

export const GET = consume;
export const POST = consume;
