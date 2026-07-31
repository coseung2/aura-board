"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";
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
  pollEnabled?: boolean;
  participantsOverride?: GameParticipant[] | null;
  className?: string;
  children?: ReactNode;
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
  pollEnabled = true,
  participantsOverride,
  className,
  children,
}: Props) {
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const displayedParticipants = participantsOverride ?? participants;
  const pollSnapshotRef = useRef(pollSnapshot);
  const onReadyRef = useRef(onReady);
  const isReadyStatusRef = useRef(isReadyStatus);
  const mountedRef = useRef(false);
  const refreshRunnerRef = useRef<ReturnType<typeof createTrailingRefreshRunner> | null>(null);
  pollSnapshotRef.current = pollSnapshot;
  onReadyRef.current = onReady;
  isReadyStatusRef.current = isReadyStatus;
  if (!refreshRunnerRef.current) {
    refreshRunnerRef.current = createTrailingRefreshRunner(async () => {
      if (!mountedRef.current) return;
      const snapshot = await pollSnapshotRef.current();
      if (!mountedRef.current || !snapshot) return;
      setParticipants(snapshot.participants);
      if (isReadyStatusRef.current(snapshot.status)) onReadyRef.current();
    });
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    mountedRef.current = true;
    const refreshRunner = refreshRunnerRef.current!;

    function stopPolling() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function schedulePoll(delayMs: number) {
      if (
        cancelled ||
        !pollEnabled ||
        document.visibilityState !== "visible" ||
        timer !== null
      ) {
        return;
      }
      timer = window.setTimeout(async () => {
        timer = null;
        if (
          cancelled ||
          !pollEnabled ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        await refreshRunner.run();
        schedulePoll(pollDelayMs);
      }, delayMs);
    }

    function reconcileWhenVisible() {
      if (document.visibilityState !== "visible") return;
      void refreshRunner.run();
      schedulePoll(pollDelayMs);
    }

    if (pollEnabled) {
      schedulePoll(1000);
    } else {
      // Reconcile exactly once when Realtime takes over HTTP transport.
      void refreshRunner.run();
    }
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    return () => {
      cancelled = true;
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
    };
  }, [isReadyStatus, onReady, pollDelayMs, pollEnabled, pollSnapshot]);

  return (
    <main className={["game-waiting", className].filter(Boolean).join(" ")}>
      {gameLabel ? <p className="game-kicker">{gameLabel}</p> : null}
      <h1>{title}</h1>
      {message ? <p>{message}</p> : null}
      {children}
      <div className="game-waiting-participants" aria-label="입장한 학생">
        <span>입장한 사람 {displayedParticipants.length}명</span>
        <GameParticipantsList participants={displayedParticipants} label="" />
      </div>
    </main>
  );
}
