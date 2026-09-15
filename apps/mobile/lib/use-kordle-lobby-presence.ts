import { normalizeGamePresence } from "../../../src/lib/game-platform/presence";
import { useGamePresence } from "./use-game-presence";

export type KordleLobbyPresenceParticipant = {
  studentId: string;
  name: string;
  joinedAt: string;
};

export const normalizeKordleLobbyPresence = normalizeGamePresence;

export function useKordleLobbyPresence(
  boardId: string,
  student: { id: string; name: string },
  enabled: boolean,
) {
  return useGamePresence({
    gameKind: "kordle",
    scopeId: boardId,
    student,
    enabled,
  });
}
