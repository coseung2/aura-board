"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setParticipants(initialParticipants);
    setStatus(initialStatus ?? null);
    setRound(null);
  }, [initialParticipants, initialStatus, puzzleId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/kordle/boards/${encodeURIComponent(boardId)}/participants?puzzleId=${encodeURIComponent(puzzleId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const nextParticipants = data?.puzzle?.participants;
        if (!cancelled && Array.isArray(nextParticipants)) {
          setParticipants(nextParticipants);
          setStatus(data?.puzzle?.status ?? null);
          setRound(data?.puzzle?.round ?? null);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, pollDelayMs);
        }
      }
    }

    timer = window.setTimeout(poll, 600);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [boardId, pollDelayMs, puzzleId]);

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
