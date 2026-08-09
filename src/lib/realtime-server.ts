import "server-only";

import { after } from "next/server";
import type { RealtimeEvent } from "./realtime";
import {
  announceSpeedGameChange,
  publishValidatedRealtimeEvent,
} from "./realtime-broadcast";

function reportFailure(error: unknown) {
  console.error("[realtime broadcast] deferred delivery failed", error);
}

/** Validate and synchronously deliver an event through Supabase Broadcast. */
export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  await publishValidatedRealtimeEvent(event);
}

/** Keep UX invalidation outside mutation latency while letting Next track it. */
export function scheduleRealtimePublish(event: RealtimeEvent): void {
  after(async () => {
    try {
      await publishRealtimeEvent(event);
    } catch (error) {
      reportFailure(error);
    }
  });
}

export function scheduleSpeedGameChange(
  gameId: string,
  changeType:
    | "start"
    | "next"
    | "finish"
    | "end-early"
    | "rematch"
    | "answer"
    | "answer-review"
    | "participant-join"
    | "participant-ready"
    | "participant-forfeit",
): void {
  after(() => announceSpeedGameChange(gameId, changeType));
}
