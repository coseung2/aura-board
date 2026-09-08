"use client";

import { useEffect, useState } from "react";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";

/** Display only: the game server decides deadlines and awarded points. */
export function useSongGuessClock(snapshot: SongGuessSnapshot | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const deadline = snapshot?.currentRound.deadlineAtMs;
  const serverTime = snapshot?.serverTimeMs;
  const phase = snapshot?.phase;

  useEffect(() => {
    if (phase !== "guessing" || deadline == null || serverTime == null) {
      setRemainingMs(null);
      return;
    }
    const receivedAt = performance.now();
    const tick = () => setRemainingMs(Math.max(0, deadline - serverTime - (performance.now() - receivedAt)));
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [deadline, serverTime, phase]);

  return {
    remainingSeconds: remainingMs === null ? null : Math.ceil(remainingMs / 1000),
    expired: phase === "guessing" && deadline != null &&
      ((serverTime != null && serverTime >= deadline) || remainingMs === 0),
  };
}
