import {
  subscribeGamePresence,
  type GamePresenceClient,
  type GamePresenceParticipant,
} from "@/lib/game-platform/presence";

export type KordlePresencePayload = GamePresenceParticipant;

export function subscribeKordleLobbyPresence(
  client: GamePresenceClient,
  boardId: string,
  self: { studentId: string; name: string } | null,
  onChange: (participants: KordlePresencePayload[] | null) => void,
) {
  return subscribeGamePresence(client, {
    scopeKind: "board",
    gameKind: "kordle",
    scopeId: boardId,
    self,
    onChange,
  });
}
