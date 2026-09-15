"use client";

import { useGamePresence } from "@/features/games/hooks/useGamePresence";

export function useKordleLobbyPresence(
  boardId: string,
  self: { studentId: string; name: string } | null = null,
) {
  return useGamePresence({
    gameKind: "kordle",
    scopeId: boardId,
    self,
  });
}
