"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createTrailingRefreshRunner } from "@/lib/realtime-invalidation";
import {
  KORDLE_GUESS_SUBMITTED_EVENT,
  KORDLE_PUZZLE_CHANGED_EVENT,
  kordleBoardChannelKey,
  type KordlePuzzleChangedEvent,
} from "../realtime";
import {
  GameParticipantsList,
  type GameParticipant,
} from "@/features/games/components/GameParticipantsList";

type Props = {
  boardId: string;
  puzzleId: string;
  initialParticipants: GameParticipant[];
  initialStatus?: string | null;
  maxGuesses: number;
  pollDelayMs?: number;
};

type RoundSnapshot = {
  currentGuessIndex: number | null;
  submittedCount: number;
  totalCount: number;
  roundEndsAt: string | null;
  remainingMs: number;
  pendingParticipants: GameParticipant[];
};

type ParticipantsSnapshot = {
  participants: GameParticipant[];
  status: string | null;
  round: RoundSnapshot | null;
};

export function KordleTeacherParticipants({
  boardId,
  puzzleId,
  initialParticipants,
  initialStatus,
  maxGuesses,
  pollDelayMs = 2000,
}: Props) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [status, setStatus] = useState(initialStatus ?? null);
  const [round, setRound] = useState<RoundSnapshot | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  useEffect(() => {
    setParticipants(initialParticipants);
    setStatus(initialStatus ?? null);
    setRound(null);
  }, [initialParticipants, initialStatus, puzzleId]);

  const fetchSnapshot = useCallback(async (): Promise<ParticipantsSnapshot | null> => {
    const res = await fetch(
      `/api/kordle/boards/${encodeURIComponent(boardId)}/participants?puzzleId=${encodeURIComponent(puzzleId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const nextParticipants = data?.puzzle?.participants;
    if (Array.isArray(nextParticipants)) {
      return {
        participants: nextParticipants,
        status: data?.puzzle?.status ?? null,
        round: data?.puzzle?.round ?? null,
      };
    }
    return null;
  }, [boardId, puzzleId]);

  const applySnapshot = useCallback((snapshot: ParticipantsSnapshot | null) => {
    if (!snapshot) return;
    setParticipants(snapshot.participants);
    setStatus(snapshot.status);
    setRound(snapshot.round);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let subscribed = false;
    let timer: number | null = null;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    const refreshRunner = createTrailingRefreshRunner(async () => {
      if (cancelled) return;
      const snapshot = await fetchSnapshot();
      if (!cancelled) applySnapshot(snapshot);
    });

    function stopFallbackPolling() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleFallbackPolling(delayMs = pollDelayMs) {
      if (
        cancelled ||
        subscribed ||
        document.visibilityState !== "visible" ||
        timer !== null
      ) {
        return;
      }
      timer = window.setTimeout(async () => {
        timer = null;
        if (
          cancelled ||
          subscribed ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        await refreshRunner.run();
        scheduleFallbackPolling();
      }, delayMs);
    }

    function reconcileWhenVisible() {
      if (document.visibilityState !== "visible") return;
      void refreshRunner.run();
      if (!subscribed) scheduleFallbackPolling();
    }

    async function subscribe() {
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
        channel = supabase
          .channel(kordleBoardChannelKey(boardId))
          .on("broadcast", { event: KORDLE_GUESS_SUBMITTED_EVENT }, () => {
            void refreshRunner.run();
          })
          .on(
            "broadcast",
            { event: KORDLE_PUZZLE_CHANGED_EVENT },
            ({ payload }: { payload: KordlePuzzleChangedEvent }) => {
              if (cancelled) return;
              if (payload?.status) setStatus(payload.status);
              void refreshRunner.run();
            },
          )
          .subscribe((nextStatus) => {
            if (cancelled) return;
            if (nextStatus === "SUBSCRIBED") {
              subscribed = true;
              stopFallbackPolling();
              // Reconcile once at the handoff from HTTP fallback to Realtime.
              void refreshRunner.run();
              return;
            }
            if (
              nextStatus === "CHANNEL_ERROR" ||
              nextStatus === "TIMED_OUT" ||
              nextStatus === "CLOSED"
            ) {
              subscribed = false;
              scheduleFallbackPolling();
            }
          });
      } catch {
        if (!cancelled) {
          subscribed = false;
          scheduleFallbackPolling();
        }
      }
    }

    scheduleFallbackPolling(600);
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    void subscribe();
    return () => {
      cancelled = true;
      subscribed = false;
      stopFallbackPolling();
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [applySnapshot, boardId, fetchSnapshot, pollDelayMs]);

  async function advanceLine() {
    if (advancing || !round?.currentGuessIndex || round.currentGuessIndex >= maxGuesses) {
      return;
    }
    setAdvancing(true);
    setControlError(null);
    try {
      const res = await fetch(`/api/kordle/boards/${encodeURIComponent(boardId)}/puzzle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "advance", puzzleId }),
      });
      if (!res.ok) {
        setControlError("다음 줄로 넘기지 못했습니다.");
        return;
      }
      const snapshot = await fetchSnapshot();
      applySnapshot(snapshot);
    } finally {
      setAdvancing(false);
    }
  }

  const canAdvance =
    status === "LIVE" &&
    !!round?.currentGuessIndex &&
    round.currentGuessIndex < maxGuesses;

  return (
    <div className="kordle-teacher-participants" aria-live="polite">
      <div className="kordle-teacher-participants-header">
        <span>입장한 학생</span>
        <strong>{participants.length}명</strong>
      </div>
      {participants.length > 0 ? (
        <GameParticipantsList
          className="kordle-participant-list"
          participants={participants}
          label=""
        />
      ) : (
        <p>아직 입장한 학생이 없어요.</p>
      )}
      {status === "DRAFT" && <small>학생이 대기실에 들어오면 자동으로 표시됩니다.</small>}
      {status === "LIVE" && round?.currentGuessIndex && (
        <div className="kordle-round-progress">
          <div className="kordle-round-progress-header">
            <span>{round.currentGuessIndex}줄</span>
            <button
              type="button"
              className="kordle-next-line-btn"
              onClick={() => void advanceLine()}
              disabled={!canAdvance || advancing}
            >
              다음 줄
            </button>
          </div>
          <p>
            {round.submittedCount}/{round.totalCount}명 제출 완료
          </p>
          {controlError && <small role="alert">{controlError}</small>}
          {round.pendingParticipants.length > 0 ? (
            <GameParticipantsList
              className="kordle-participant-list"
              participants={round.pendingParticipants}
              label="아직 제출 안 함"
            />
          ) : (
            <small>모두 제출했습니다.</small>
          )}
        </div>
      )}
    </div>
  );
}
