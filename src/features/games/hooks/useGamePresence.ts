"use client";

import { useEffect, useState } from "react";
import type { OfficialGameKind } from "@/lib/game-platform/contracts";
import {
  subscribeGamePresence,
  type GamePresenceClient,
  type GamePresenceParticipant,
  type GamePresenceScopeKind,
} from "@/lib/game-platform/presence";

function usePresenceSubscription({
  scopeKind,
  scopeId,
  gameKind,
  self,
  enabled,
}: {
  scopeKind: GamePresenceScopeKind;
  scopeId: string;
  gameKind: OfficialGameKind | null;
  self: { studentId: string; name: string } | null;
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
      if (document.hidden) return;
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (disposed || version !== generation) return;
        unsubscribe = subscribeGamePresence(
          createPublicSupabaseClient() as unknown as GamePresenceClient,
          { scopeKind, scopeId, gameKind, self, onChange: setParticipants },
        );
      } catch {
        if (!disposed && version === generation) setParticipants(null);
      }
    }

    void connect();
    const reconnect = () => {
      if (!document.hidden) void connect();
    };
    document.addEventListener("visibilitychange", reconnect);
    window.addEventListener("online", reconnect);
    return () => {
      disposed = true;
      ++generation;
      unsubscribe?.();
      document.removeEventListener("visibilitychange", reconnect);
      window.removeEventListener("online", reconnect);
    };
  }, [enabled, gameKind, scopeId, scopeKind, self?.studentId, self?.name]);

  return participants;
}

export function useGamePresence({
  gameKind,
  scopeId,
  scopeKind = "board",
  self = null,
  enabled = true,
}: {
  gameKind: OfficialGameKind;
  scopeId: string;
  scopeKind?: GamePresenceScopeKind;
  self?: { studentId: string; name: string } | null;
  enabled?: boolean;
}): GamePresenceParticipant[] | null {
  return usePresenceSubscription({
    scopeKind,
    scopeId,
    gameKind,
    self,
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
}): GamePresenceParticipant[] | null {
  return usePresenceSubscription({
    scopeKind,
    scopeId,
    gameKind: null,
    self: null,
    enabled,
  });
}
