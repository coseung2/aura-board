import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import type { GameParticipantPetData } from "./game-participant-pet";
import type { OmokSlot } from "./omok-contract";

export type OmokPlayerPet = {
  studentId: string;
  slot: OmokSlot;
  name: string;
  pet: GameParticipantPetData | null;
};

export function useOmokPlayerPets(sessionId: string | undefined) {
  const [result, setResult] = useState<{ sessionId: string; startedAtMs: number | null; players: OmokPlayerPet[] } | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await apiFetch<{ startedAtMs: number | null; players: OmokPlayerPet[] }>(`/api/play/sessions/${encodeURIComponent(sessionId)}/players`, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ sessionId, startedAtMs: response.startedAtMs, players: response.players });
      } catch {
        if (!controller.signal.aborted) retry = setTimeout(() => void load(), 5_000);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(retry); };
  }, [sessionId]);
  return result && result.sessionId === sessionId
    ? result
    : { sessionId: null, startedAtMs: null, players: [] };
}
