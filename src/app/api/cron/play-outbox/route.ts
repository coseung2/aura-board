import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { publishPlaySessionInvalidation } from "@/lib/realtime-broadcast";
import { PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";
import { playEngineInternalFetch } from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  eventType: z.enum(["session_created", "session_changed"]),
  attempts: z.number().int().min(1),
  lockToken: z.string().min(1).max(128),
});
const ClaimSchema = z.object({ events: z.array(EventSchema).max(50) });

async function consume(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }
  try {
    const claimedResponse = await playEngineInternalFetch(
      "/v1/internal/outbox/claim?limit=50",
    );
    if (!claimedResponse.ok) {
      return NextResponse.json(
        { error: "play_outbox_claim_failed" },
        { status: 503 },
      );
    }
    const claimed = ClaimSchema.parse(await claimedResponse.json());
    const successfulByLockToken = new Map<string, string[]>();
    const failedIds: string[] = [];
    for (const event of claimed.events) {
      try {
        await publishPlaySessionInvalidation({
          type: PLAY_SESSION_CHANGED_EVENT,
          eventId: event.id,
          sessionId: event.sessionId,
          boardId: event.boardId,
          version: event.version,
        });
        const ids = successfulByLockToken.get(event.lockToken) ?? [];
        ids.push(event.id);
        successfulByLockToken.set(event.lockToken, ids);
      } catch {
        failedIds.push(event.id);
      }
    }
    let delivered = 0;
    for (const [lockToken, ids] of successfulByLockToken) {
      const completed = await playEngineInternalFetch(
        "/v1/internal/outbox/complete",
        { body: { ids, lockToken } },
      );
      if (!completed.ok) {
        return NextResponse.json(
          {
            error: "play_outbox_complete_failed",
            claimed: claimed.events.length,
            delivered,
          },
          { status: 503 },
        );
      }
      delivered += ids.length;
    }
    return NextResponse.json({
      claimed: claimed.events.length,
      delivered,
      pendingRetry: failedIds.length,
    });
  } catch (error) {
    return playRouteError(error);
  }
}

export const GET = consume;
export const POST = consume;
