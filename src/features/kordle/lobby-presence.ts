import type { SupabaseClient } from "@supabase/supabase-js";
import { kordleParticipantsFromPresenceState, type KordlePresencePayload } from "./realtime";

/** Ephemeral lobby presence is display-only, never a scoring/permission source.
 * Keep it on a separate channel from durable puzzle/guess invalidations. */
export function subscribeKordleLobbyPresence(
  client: Pick<SupabaseClient, "channel" | "removeChannel">,
  boardId: string,
  self: { studentId: string; name: string } | null,
  onChange: (participants: KordlePresencePayload[] | null) => void,
) {
  let stopped = false;
  const joinedAt = new Date().toISOString();
  const channel = client.channel(`kordle:lobby:${boardId}`, {
    config: { presence: { key: self ? `${self.studentId}:${joinedAt}` : `observer:${joinedAt}` } },
  });
  onChange(null);
  channel.on("presence", { event: "sync" }, () => {
    if (!stopped) onChange(kordleParticipantsFromPresenceState(channel.presenceState<KordlePresencePayload>()));
  }).subscribe((status) => {
    if (stopped) return;
    if (status === "SUBSCRIBED" && self) {
      void channel.track({ ...self, joinedAt }).then((result) => {
        if (!stopped && result !== "ok") onChange(null);
      }).catch(() => { if (!stopped) onChange(null); });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      onChange(null); // Unknown is not an empty room.
    }
  });
  return () => {
    if (stopped) return;
    stopped = true;
    void channel.untrack().catch(() => undefined);
    void Promise.resolve(client.removeChannel(channel)).catch(() => undefined);
  };
}
