
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameExitDialog } from "@/components/game-platform/GameExitDialog";
import {
  SPEED_GAME_CHANGED_EVENT,
  speedGameChannelKey,
} from "@/lib/realtime";
import type { PublicSupabaseClient } from "@/lib/supabase/client";
import type { SpeedGameWire } from "./types";
import {
  FALLBACK_BASE_DELAY_MS,
  FALLBACK_MAX_DELAY_MS,
  answerForRound,
  type CommandErrorBody,
  errorMessage,
  makeRequestId,
  readJson,
  type ParticipantAction,
  type PendingCommand,
  type RefreshResult,
  type RunAction,
} from "./speed-game-board-utils";
import { SpeedGameTerminalPanel } from "./SpeedGameTerminalPanel";

type Props = {
  boardId: string;
  boardSlug: string;
  classroomId: string;
  viewerKind: "teacher" | "student" | "none";
  currentStudentId: string | null;
  initialGame: SpeedGameWire | null;
};

export function SpeedGameBoard({
  boardId,
  boardSlug,
  classroomId,
  viewerKind,
  currentStudentId,
  initialGame,
}: Props) {
  const [game, setGame] = useState<SpeedGameWire | null>(initialGame);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const runCommandRef = useRef<PendingCommand | null>(null);
  const participantCommandRef = useRef<PendingCommand | null>(null);
  const answerCommandRef = useRef<PendingCommand | null>(null);
  const reviewCommandRef = useRef<PendingCommand | null>(null);
  const joinedRunRef = useRef<string | null>(null);
  const gameStatusRef = useRef<SpeedGameWire["status"] | null>(
    initialGame?.status ?? null,
  );
  const refreshGameIdRef = useRef<string | undefined>(initialGame?.id);
  const refreshInFlightRef = useRef<Promise<RefreshResult> | null>(null);
  const refreshQueuedRef = useRef(false);
  const gameId = game?.id;

  gameStatusRef.current = game?.status ?? null;
  refreshGameIdRef.current = gameId;

  const refresh = useCallback((): Promise<RefreshResult> => {
    if (!gameId || gameStatusRef.current === "finished") {
      return Promise.resolve("terminal");
    }
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }

    const targetGameId = gameId;
    const request = (async (): Promise<RefreshResult> => {
      let result: RefreshResult = "skipped";
      do {
        refreshQueuedRef.current = false;
        if (
          refreshGameIdRef.current !== targetGameId ||
          gameStatusRef.current === "finished"
        ) {
          return "terminal";
        }
        try {
          const response = await fetch(`/api/speed-game/games/${targetGameId}`, {
            cache: "no-store",
          });
          if (!response.ok) {
            result = "failed";
            continue;
          }
          const body = await readJson<{ game?: SpeedGameWire }>(response);
          if (refreshGameIdRef.current !== targetGameId) return "skipped";
          if (
            (gameStatusRef.current as SpeedGameWire["status"] | null) ===
            "finished"
          ) {
            return "terminal";
          }
          if (!body?.game) {
            result = "failed";
            continue;
          }
          const next = body.game;
          for (const commandRef of [
            runCommandRef,
            participantCommandRef,
            answerCommandRef,
            reviewCommandRef,
          ]) {
            if (
              commandRef.current &&
              next.version !== commandRef.current.expectedVersion
            ) {
              commandRef.current = null;
            }
          }
          gameStatusRef.current = next.status;
          setGame(next);
          setError(null);
          result = next.status === "finished" ? "terminal" : "updated";
        } catch {
          result = "failed";
        }
      } while (refreshQueuedRef.current && result !== "terminal");
      return result;
    })().finally(() => {
      refreshInFlightRef.current = null;
    });

    refreshInFlightRef.current = request;
    return request;
  }, [gameId]);

  useEffect(() => {
    setGame(initialGame);
    setAnswer("");
    setError(null);
    setExitOpen(false);
    runCommandRef.current = null;
    participantCommandRef.current = null;
    answerCommandRef.current = null;
    reviewCommandRef.current = null;
    joinedRunRef.current = null;
  }, [initialGame]);

  useEffect(() => {
    if (!gameId || game?.status === "finished") {
      setReconnecting(false);
      return;
    }
    let stopped = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackDelayMs = FALLBACK_BASE_DELAY_MS;
    let fallbackActive = false;
    let supabase: PublicSupabaseClient | null = null;
    let channel: ReturnType<PublicSupabaseClient["channel"]> | null = null;

    function stopFallback() {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = null;
      fallbackDelayMs = FALLBACK_BASE_DELAY_MS;
      fallbackActive = false;
      if (!stopped) setReconnecting(false);
    }

    function stopRealtime() {
      if (stopped) return;
      stopped = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = null;
      setReconnecting(false);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      if (supabase && channel) {
        void supabase.removeChannel(channel).catch(() => undefined);
      }
    }

    function scheduleFallback() {
      if (
        stopped ||
        !fallbackActive ||
        fallbackTimer ||
        gameStatusRef.current === "finished"
      ) {
        return;
      }
      const delay = fallbackDelayMs;
      fallbackTimer = setTimeout(async () => {
        fallbackTimer = null;
        if (stopped) return;
        const result = document.hidden ? "skipped" : await refresh();
        if (result === "terminal" || gameStatusRef.current === "finished") {
          stopRealtime();
          return;
        }
        fallbackDelayMs =
          result === "failed"
            ? Math.min(delay * 2, FALLBACK_MAX_DELAY_MS)
            : FALLBACK_BASE_DELAY_MS;
        scheduleFallback();
      }, delay);
    }

    function startFallback() {
      if (stopped || gameStatusRef.current === "finished") return;
      setReconnecting(true);
      if (fallbackActive) return;
      fallbackActive = true;
      void refresh().then((result) => {
        if (result === "terminal" || gameStatusRef.current === "finished") {
          stopRealtime();
          return;
        }
        fallbackDelayMs =
          result === "failed"
            ? Math.min(FALLBACK_BASE_DELAY_MS * 2, FALLBACK_MAX_DELAY_MS)
            : FALLBACK_BASE_DELAY_MS;
        scheduleFallback();
      });
    }

    void (async () => {
      try {
        const { createIsolatedPublicSupabaseClient } = await import(
          "@/lib/supabase/client"
        );
        if (stopped) return;
        supabase = createIsolatedPublicSupabaseClient();
        channel = supabase
          .channel(speedGameChannelKey(gameId))
          .on("broadcast", { event: SPEED_GAME_CHANGED_EVENT }, () => {
            void refresh().then((result) => {
              if (result === "terminal" || gameStatusRef.current === "finished") {
                stopRealtime();
              }
            });
          });
        channel.subscribe((status: string) => {
          if (stopped || gameStatusRef.current === "finished") {
            stopRealtime();
            return;
          }
          if (status === "SUBSCRIBED") {
            stopFallback();
            void refresh();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            startFallback();
          }
        });
      } catch {
        startFallback();
      }
    })();

    function reconcile() {
      if (!document.hidden) {
        void refresh().then((result) => {
          if (result === "terminal" || gameStatusRef.current === "finished") {
            stopRealtime();
          }
        });
      }
    }

    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return stopRealtime;
  }, [game?.status, gameId, refresh]);

  const currentRound = useMemo(() => {
    if (!game || game.roundIndex < 0) return null;
    return game.rounds.find((round) => round.order === game.roundIndex) ?? null;
  }, [game]);

  const currentParticipant = useMemo(() => {
    if (!game || !currentStudentId) return null;
    return (
      game.participants.find(
        (participant) => participant.studentId === currentStudentId,
      ) ?? null
    );
  }, [currentStudentId, game]);

  const currentGroup = useMemo(() => {
    if (!game || !currentParticipant) return null;
    return game.groups.find((group) => group.id === currentParticipant.groupId) ?? null;
  }, [currentParticipant, game]);

  const canAnswer = useMemo(() => {
    if (
      !game ||
      !currentRound ||
      !currentParticipant ||
      !currentGroup ||
      currentParticipant.forfeitedAt ||
      game.status !== "active"
    ) {
      return false;
    }
    const memberIndex = currentGroup.studentIds.indexOf(currentParticipant.studentId);
    if (memberIndex < 0 || memberIndex + 1 !== currentRound.guesserSlot) return false;
    return !answerForRound(game, currentRound.id, currentGroup.id);
  }, [currentGroup, currentParticipant, currentRound, game]);

  const executeParticipantCommand = useCallback(
    async (action: ParticipantAction) => {
      if (!game || !currentStudentId || viewerKind !== "student") return null;
      const fingerprint = `${action}:${game.runId}`;
      const pending = participantCommandRef.current;
      const command =
        pending &&
        pending.runId === game.runId &&
        pending.expectedVersion === game.version &&
        pending.fingerprint === fingerprint
          ? pending
          : {
              requestId: makeRequestId(`speed_${action}`),
              runId: game.runId,
              expectedVersion: game.version,
              fingerprint,
            };
      participantCommandRef.current = command;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/speed-game/games/${encodeURIComponent(game.id)}/participant`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              requestId: command.requestId,
              runId: command.runId,
              expectedVersion: command.expectedVersion,
              action,
            }),
          },
        );
        const body = await readJson<
          | { game: SpeedGameWire; resultId?: string | null }
          | CommandErrorBody
        >(response);
        if (!response.ok) {
          if (body && "game" in body && body.game) {
            setGame(body.game);
            if (body.game.version !== command.expectedVersion) {
              participantCommandRef.current = null;
            }
          }
          setError(errorMessage(body && "error" in body ? body.error : undefined));
          return null;
        }
        if (!body || !("game" in body) || !body.game) {
          setError("최신 게임 상태를 확인하지 못했어요.");
          return null;
        }
        participantCommandRef.current = null;
        setGame(body.game);
        return body;
      } finally {
        setBusy(false);
      }
    },
    [currentStudentId, game, viewerKind],
  );

  useEffect(() => {
    if (
      viewerKind !== "student" ||
      !game ||
      !currentParticipant ||
      currentParticipant.joinedAt ||
      currentParticipant.forfeitedAt ||
      joinedRunRef.current === game.runId
    ) {
      return;
    }
    joinedRunRef.current = game.runId;
    void executeParticipantCommand("join").then((result) => {
      if (!result) joinedRunRef.current = null;
    });
  }, [currentParticipant, executeParticipantCommand, game, viewerKind]);

  const mutateRun = useCallback(
    async (action: RunAction) => {
      if (!game || viewerKind !== "teacher") return;
      const fingerprint = `${action}:${game.runId}`;
      const pending = runCommandRef.current;
      const command =
        pending &&
        pending.runId === game.runId &&
        pending.expectedVersion === game.version &&
        pending.fingerprint === fingerprint
          ? pending
          : {
              requestId: makeRequestId(`speed_${action}`),
              runId: game.runId,
              expectedVersion: game.version,
              fingerprint,
            };
      runCommandRef.current = command;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/speed-game/games/${encodeURIComponent(game.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: command.requestId,
            runId: command.runId,
            expectedVersion: command.expectedVersion,
            action,
          }),
        });
        const body = await readJson<{ game?: SpeedGameWire; error?: string }>(response);
        if (!response.ok) {
          if (body?.game) {
            setGame(body.game);
            if (body.game.version !== command.expectedVersion) {
              runCommandRef.current = null;
            }
          }
          setError(errorMessage(body?.error));
          return;
        }
        if (!body?.game) {
          setError("최신 게임 상태를 확인하지 못했어요.");
          return;
        }
        runCommandRef.current = null;
        joinedRunRef.current = null;
        setGame(body.game);
        setAnswer("");
      } finally {
        setBusy(false);
      }
    },
    [game, viewerKind],
  );

  const submitAnswer = useCallback(async () => {
    if (!game || !currentRound || !currentGroup || !canAnswer) return;
    const rawText = answer.trim();
    if (!rawText) return;
    const fingerprint = `${game.runId}:${currentRound.id}:${currentGroup.id}:${rawText}`;
    const pending = answerCommandRef.current;
    const command =
      pending &&
      pending.runId === game.runId &&
      pending.expectedVersion === game.version &&
      pending.fingerprint === fingerprint
        ? pending
        : {
            requestId: makeRequestId("speed_answer"),
            runId: game.runId,
            expectedVersion: game.version,
            fingerprint,
          };
    answerCommandRef.current = command;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/speed-game/games/${encodeURIComponent(game.id)}/answer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: command.requestId,
            runId: command.runId,
            expectedVersion: command.expectedVersion,
            answer: rawText,
            roundId: currentRound.id,
            groupId: currentGroup.id,
          }),
        },
      );
      const body = await readJson<{ game?: SpeedGameWire; error?: string }>(response);
      if (!response.ok) {
        if (body?.game) {
          setGame(body.game);
          if (body.game.version !== command.expectedVersion) {
            answerCommandRef.current = null;
          }
        }
        setError(errorMessage(body?.error));
        return;
      }
      if (!body?.game) {
        setError("최신 게임 상태를 확인하지 못했어요.");
        return;
      }
      answerCommandRef.current = null;
      setGame(body.game);
      setAnswer("");
    } finally {
      setBusy(false);
    }
  }, [answer, canAnswer, currentGroup, currentRound, game]);

  const reviewAnswer = useCallback(
    async (answerId: string, decision: "accepted" | "rejected") => {
      if (!game || viewerKind !== "teacher") return;
      const fingerprint = `${answerId}:${decision}`;
      const pending = reviewCommandRef.current;
      const command =
        pending &&
        pending.runId === game.runId &&
        pending.expectedVersion === game.version &&
        pending.fingerprint === fingerprint
          ? pending
          : {
              requestId: makeRequestId("speed_review"),
              runId: game.runId,
              expectedVersion: game.version,
              fingerprint,
            };
      reviewCommandRef.current = command;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/speed-game/games/${encodeURIComponent(game.id)}/answer`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              requestId: command.requestId,
              runId: command.runId,
              expectedVersion: command.expectedVersion,
              answerId,
              decision,
            }),
          },
        );
        const body = await readJson<{ game?: SpeedGameWire; error?: string }>(response);
        if (!response.ok) {
          if (body?.game) {
            setGame(body.game);
            if (body.game.version !== command.expectedVersion) {
              reviewCommandRef.current = null;
            }
          }
          setError(errorMessage(body?.error));
          return;
        }
        if (!body?.game) return;
        reviewCommandRef.current = null;
        setGame(body.game);
      } finally {
        setBusy(false);
      }
    },
    [game, viewerKind],
  );

  const terminalPanel = (
    <SpeedGameTerminalPanel
      game={game}
      viewerKind={viewerKind}
      busy={busy}
      reconnecting={reconnecting}
      error={error}
      currentParticipant={currentParticipant}
      currentGroup={currentGroup}
      onRunAction={mutateRun}
      onParticipantAction={executeParticipantCommand}
    />
  );
  if (!game || viewerKind === "none" || game.status !== "active") {
    return terminalPanel;
  }

  const pendingAnswers = game.answers.filter((item) => item.correct === null);
  const currentAnswer =
    currentRound && currentGroup
      ? answerForRound(game, currentRound.id, currentGroup.id)
      : undefined;

  return (
    <section className="speed-game-shell" aria-busy={busy || reconnecting || undefined}>
      <header className="speed-game-round-header">
        <div>
          <p className="speed-game-eyebrow">ROUND</p>
          <h2>
            {currentRound
              ? `${currentRound.order + 1}/${game.rounds.length} 라운드`
              : "라운드 준비 중"}
          </h2>
        </div>
        <div className="speed-game-round-actions">
          {viewerKind === "teacher" ? (
            <>
              <button
                type="button"
                className="speed-game-secondary-button"
                disabled={busy || !currentRound || currentRound.order >= game.rounds.length - 1}
                onClick={() => void mutateRun("next")}
              >
                다음 라운드
              </button>
              <button
                type="button"
                className="speed-game-primary-button"
                disabled={busy}
                onClick={() => void mutateRun("finish")}
              >
                게임 완료
              </button>
              <button
                type="button"
                className="speed-game-danger-button"
                disabled={busy}
                onClick={() => void mutateRun("end-early")}
              >
                조기 종료
              </button>
            </>
          ) : (
            <button
              type="button"
              className="speed-game-danger-button"
              disabled={busy || Boolean(currentParticipant?.forfeitedAt)}
              onClick={() => setExitOpen(true)}
            >
              게임 나가기
            </button>
          )}
        </div>
      </header>

      {reconnecting ? (
        <p className="speed-game-notice" role="status">
          최신 게임 상태를 다시 확인하고 있어요. 입력은 잠시 잠깁니다.
        </p>
      ) : null}
      {error ? <p className="speed-game-error" role="alert">{error}</p> : null}

      <div className="speed-game-keyword-card">
        <span>제시어</span>
        <strong>
          {viewerKind === "teacher"
            ? currentRound?.keyword ?? "—"
            : currentRound
              ? `${currentRound.guesserSlot}번 순서`
              : "—"}
        </strong>
      </div>

      {viewerKind === "student" ? (
        <section className="speed-game-answer-panel" aria-label="답변 제출">
          <p>
            {currentGroup
              ? `${currentGroup.name} · ${currentRound?.guesserSlot ?? "-"}번 순서`
              : "배정된 모둠이 없습니다."}
          </p>
          {currentAnswer ? (
            <p role="status">
              제출 완료: {currentAnswer.answer || "답변 비공개"}
              {currentAnswer.correct === null
                ? " · 교사 확인 중"
                : currentAnswer.correct
                  ? ` · 정답 +${currentAnswer.score ?? 0}점`
                  : " · 오답"}
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitAnswer();
              }}
            >
              <label htmlFor="speed-game-answer">답변</label>
              <div className="speed-game-answer-row">
                <input
                  id="speed-game-answer"
                  value={answer}
                  maxLength={200}
                  disabled={!canAnswer || busy || reconnecting}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder={canAnswer ? "답을 입력하세요" : "내 순서를 기다려 주세요"}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="speed-game-primary-button"
                  disabled={!canAnswer || busy || reconnecting || !answer.trim()}
                >
                  정답 제출
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section className="speed-game-leaderboard" aria-label="모둠 점수">
        <h3>모둠 점수</h3>
        <ol>
          {game.leaderboard.map((row) => (
            <li key={row.groupId}>
              <span>{row.groupName}</span>
              <strong>{row.score.toLocaleString("ko-KR")}점</strong>
            </li>
          ))}
        </ol>
      </section>

      {viewerKind === "teacher" && game.answerMode === "teacher-approval" ? (
        <section className="speed-game-review-panel" aria-label="답변 판정">
          <h3>답변 판정</h3>
          {pendingAnswers.length === 0 ? (
            <p>확인할 답변이 없습니다.</p>
          ) : (
            <ul>
              {pendingAnswers.map((item) => (
                <li key={item.id}>
                  <span>{item.answer}</span>
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewAnswer(item.id, "accepted")}
                    >
                      정답
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reviewAnswer(item.id, "rejected")}
                    >
                      오답
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <footer className="speed-game-runtime-meta">
        <span>run {game.runId}</span>
        <span>v{game.version}</span>
        <span>{boardSlug}</span>
        <span>{classroomId}</span>
        <span>{boardId}</span>
      </footer>

      <GameExitDialog
        open={exitOpen}
        title="스피드게임에서 나갈까요?"
        description="진행 중 나가면 이번 run은 기권으로 기록됩니다. 서버가 결과를 확정한 뒤 나갈 수 있어요."
        confirmLabel="기권하고 나가기"
        busy={busy}
        onCancel={() => setExitOpen(false)}
        onConfirm={async () => {
          const result = await executeParticipantCommand("forfeit");
          if (result) setExitOpen(false);
        }}
      />
    </section>
  );
}
