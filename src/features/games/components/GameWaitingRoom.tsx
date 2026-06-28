"use client";

import { useEffect, useState } from "react";
import { GameParticipantsList, type GameParticipant } from "./GameParticipantsList";

export type GameWaitingSnapshot = {
  status?: string | null;
  participants: GameParticipant[];
};

type Props = {
  gameLabel: string;
  title: string;
  message: string;
  pollSnapshot: () => Promise<GameWaitingSnapshot | null>;
  onReady: () => void;
  isReadyStatus?: (status: string | null | undefined) => boolean;
  pollDelayMs?: number;
  className?: string;
};

function defaultIsReadyStatus(status: string | null | undefined) {
  return status === "LIVE";
}

export function GameWaitingRoom({
  gameLabel,
  title,
  message,
  pollSnapshot,
  onReady,
  isReadyStatus = defaultIsReadyStatus,
  pollDelayMs = 1800,
  className,
}: Props) {
  const [participants, setParticipants] = useState<GameParticipant[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const snapshot = await pollSnapshot();
        if (!cancelled && snapshot) {
          setParticipants(snapshot.participants);
          if (isReadyStatus(snapshot.status)) {
            onReady();
            return;
          }
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, pollDelayMs);
        }
      }
    }

    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isReadyStatus, onReady, pollDelayMs, pollSnapshot]);

  return (
    <main className={["game-waiting", className].filter(Boolean).join(" ")}>
      <p className="game-kicker">{gameLabel}</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <div className="game-waiting-participants" aria-label="입장한 학생">
        <span>입장 {participants.length}명</span>
        <GameParticipantsList participants={participants} label="" />
      </div>
    </main>
  );
}
