import { useEffect, useState } from "react";
import { AppState } from "react-native";
import type { MobileOfficialGameKind } from "./game-platform-contract";
import {
  subscribeGamePresence,
  type GamePresenceClient,
  type GamePresenceParticipant,
  type GamePresenceScopeKind,
} from "../../../src/lib/game-platform/presence";
import { ensureMobileRealtimeClient } from "./use-board-realtime";

type MobileGameKind = MobileOfficialGameKind;

function usePresenceSubscription({
  gameKind,
  scopeKind,
  scopeId,
  student,
  enabled,
}: {
  gameKind: MobileGameKind | null;
  scopeKind: GamePresenceScopeKind;
  scopeId: string;
  student: { id: string; name: string } | null;
  enabled: boolean;
}): GamePresenceParticipant[] | null {
  const [participants, setParticipants] = useState<GamePresenceParticipant[] | null>(null);

  useEffect(() => {
    if (!enabled || !scopeId) {
      setParticipants(null);
      return;
    }
    let disposed = false;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;

    async function connect() {
      const version = ++generation;
      unsubscribe?.();
      unsubscribe = undefined;
      setParticipants(null);
      if (AppState.currentState !== "active") return;
      try {
        const client = await ensureMobileRealtimeClient();
        if (disposed || version !== generation || !client) return;
        unsubscribe = subscribeGamePresence(
          client as unknown as GamePresenceClient,
          {
            scopeKind,
            scopeId,
            gameKind: gameKind as Parameters<typeof subscribeGamePresence>[1]["gameKind"],
            self: student ? { studentId: student.id, name: student.name } : null,
            onChange: setParticipants,
          },
        );
      } catch {
        if (!disposed && version === generation) setParticipants(null);
      }
    }

    void connect();
    const listener = AppState.addEventListener("change", () => {
      void connect();
    });
    return () => {
      disposed = true;
      ++generation;
      unsubscribe?.();
      listener.remove();
    };
  }, [enabled, gameKind, scopeId, scopeKind, student?.id, student?.name]);

  return participants;
}

export function useGamePresence({
  gameKind,
  scopeId,
  scopeKind = "board",
  student,
  enabled = true,
}: {
  gameKind: MobileGameKind;
  scopeId: string;
  scopeKind?: GamePresenceScopeKind;
  student: { id: string; name: string };
  enabled?: boolean;
}) {
  return usePresenceSubscription({
    gameKind,
    scopeKind,
    scopeId,
    student,
    enabled,
  });
}

export function useGamePresenceScope({
  scopeId,
  scopeKind = "classroom",
  enabled = true,
}: {
  scopeId: string;
  scopeKind?: GamePresenceScopeKind;
  enabled?: boolean;
}) {
  return usePresenceSubscription({
    gameKind: null,
    scopeKind,
    scopeId,
    student: null,
    enabled,
  });
}
