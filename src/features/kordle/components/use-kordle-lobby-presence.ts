"use client";
import { useEffect, useState } from "react";
import { subscribeKordleLobbyPresence } from "../lobby-presence";
import type { KordlePresencePayload } from "../realtime";

export function useKordleLobbyPresence(boardId: string, self: { studentId: string; name: string } | null = null) {
  const [participants, setParticipants] = useState<KordlePresencePayload[] | null>(null);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;
    async function connect() {
      const version = ++generation;
      unsubscribe?.(); unsubscribe = undefined;
      setParticipants(null);
      if (document.hidden) return;
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (disposed || version !== generation) return;
        unsubscribe = subscribeKordleLobbyPresence(createPublicSupabaseClient(), boardId, self, setParticipants);
      } catch { if (!disposed) setParticipants(null); }
    }
    void connect();
    const resume = () => { void connect(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true; ++generation; unsubscribe?.();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [boardId, self?.studentId, self?.name]);
  return participants;
}
