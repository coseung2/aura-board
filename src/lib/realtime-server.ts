import { after } from "next/server";
import { publish, type RealtimeEvent } from "./realtime";
import { announceSpeedGameChange } from "./realtime-broadcast";

function reportFailure(error: unknown) {
  console.error("[realtime broadcast] deferred delivery failed", error);
}

/** Keep UX invalidation outside mutation latency while letting Next track it. */
export function scheduleRealtimePublish(event: RealtimeEvent): void {
  after(async () => {
    try {
      await publish(event);
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
