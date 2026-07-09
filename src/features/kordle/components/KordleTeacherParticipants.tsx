"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
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
  pollDelayMs = 2000,
}: Props) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [status, setStatus] = useState(initialStatus ?? null);
  const [round, setRound] = useState<RoundSnapshot | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [realtimeReady, setRealtimeReady] = useState(false);

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
    let timer: number | null = null;

    async function poll() {
      try {
        const snapshot = await fetchSnapshot();
        if (!cancelled) applySnapshot(snapshot);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, realtimeReady ? 30000 : pollDelayMs);
        }
      }
    }

    timer = window.setTimeout(poll, 600);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [applySnapshot, fetchSnapshot, pollDelayMs, realtimeReady]);

  useEffect(() => {
    let cancelled = false;
    let supabase: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;

    async function subscribe() {
      try {
        const { createPublicSupabaseClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        supabase = createPublicSupabaseClient();
        channel = supabase
          .channel(kordleBoardChannelKey(boardId))
          .on("broadcast", { event: KORDLE_GUESS_SUBMITTED_EVENT }, async () => {
            const snapshot = await fetchSnapshot();
            if (!cancelled) applySnapshot(snapshot);
          })
          .on(
            "broadcast",
            { event: KORDLE_PUZZLE_CHANGED_EVENT },
            async ({ payload }: { payload: KordlePuzzleChangedEvent }) => {
              if (cancelled) return;
              if (payload?.status) setStatus(payload.status);
              const snapshot = await fetchSnapshot();
              if (!cancelled) applySnapshot(snapshot);
            },
          )
          .subscribe((nextStatus) => {
            if (!cancelled) setRealtimeReady(nextStatus === "SUBSCRIBED");
          });
      } catch {
        if (!cancelled) setRealtimeReady(false);
      }
    }

    void subscribe();
    return () => {
      cancelled = true;
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [applySnapshot, boardId, fetchSnapshot]);

  useEffect(() => {
    if (!round?.roundEndsAt) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [round?.roundEndsAt]);

  const roundEndsAtMs = round?.roundEndsAt ? Date.parse(round.roundEndsAt) : NaN;
  const remainingMs = Number.isFinite(roundEndsAtMs)
    ? Math.max(0, roundEndsAtMs - nowMs)
    : (round?.remainingMs ?? 0);

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
            <strong>{Math.ceil(remainingMs / 1000)}초</strong>
          </div>
          <p>
            {round.submittedCount}/{round.totalCount}명 제출 완료
          </p>
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
