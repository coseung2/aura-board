"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SpeedGameAnswer,
  SpeedGameGroup,
  SpeedGameLeaderboardEntry,
  SpeedGameRound,
  SpeedGameStatus,
  SpeedGameWire,
} from "./types";
import { PlayBoardContinueButton } from "@/components/PlayBoardContinueButton";

type Props = {
  boardId: string;
  boardSlug: string;
  classroomId: string;
  viewerKind: "teacher" | "student" | "none";
  currentStudentId: string | null;
  initialGame: SpeedGameWire | null;
};

const STATUS_LABELS: Record<SpeedGameStatus, string> = {
  waiting: "대기 중",
  active: "진행 중",
  finished: "종료",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}초`;
}

function roundDisplayIndex(roundIndex: number): string {
  return roundIndex >= 0 ? String(roundIndex + 1) : "-";
}

export function SpeedGameBoard({
  boardSlug,
  classroomId,
  viewerKind,
  currentStudentId,
  initialGame,
}: Props) {
  void boardSlug;
  void classroomId;
  const [game, setGame] = useState<SpeedGameWire | null>(initialGame);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const answerStartMsRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  const gameId = game?.id;

  const currentRound = useMemo(() => {
    if (!game || game.roundIndex < 0 || game.roundIndex >= game.rounds.length) return null;
    return game.rounds[game.roundIndex];
  }, [game]);

  const myGroup = useMemo(() => {
    if (!currentStudentId || !game) return null;
    return game.groups.find((g) => g.studentIds.includes(currentStudentId)) ?? null;
  }, [currentStudentId, game]);

  const mySlot = useMemo(() => {
    if (!myGroup || !currentStudentId) return null;
    const slotIndex = myGroup.studentIds.indexOf(currentStudentId);
    return slotIndex >= 0 ? slotIndex + 1 : null;
  }, [myGroup, currentStudentId]);

  const myAnswerForCurrentRound = useMemo(() => {
    if (!game || !currentRound || !myGroup) return null;
    return (
      game.answers.find(
        (a) => a.roundId === currentRound.id && a.groupId === myGroup.id,
      ) ?? null
    );
  }, [game, currentRound, myGroup]);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`/api/speed-game/games/${gameId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { game?: SpeedGameWire };
      if (data.game) {
        setGame(data.game);
        setError((prev) => (prev ? null : prev));
      }
    } catch {
      // ignore transient refresh failures
    }
  }, [gameId]);

  useEffect(() => {
    setGame(initialGame);
  }, [initialGame]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        const es = new EventSource(`/api/speed-game/games/${gameId}/stream`);
        eventSourceRef.current = es;

        es.onopen = () => {
          reconnectDelayRef.current = 1000;
        };

        const applySnapshot = (raw: string) => {
          try {
            const payload = JSON.parse(raw) as
              | { game?: SpeedGameWire }
              | SpeedGameWire;
            const nextGame =
              "game" in payload ? payload.game : "id" in payload ? payload : null;
            if (nextGame) {
              setGame(nextGame);
            }
          } catch {
            // ignore malformed events
          }
        };

        es.onmessage = (event) => applySnapshot(event.data);
        es.addEventListener("snapshot", (event) =>
          applySnapshot((event as MessageEvent).data),
        );
        es.addEventListener("finished", (event) =>
          applySnapshot((event as MessageEvent).data),
        );

        es.onerror = () => {
          es.close();
          if (cancelled) return;
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 30000);
          reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current);
        };
      } catch {
        reconnectTimerRef.current = setTimeout(connect, reconnectDelayRef.current);
      }
    }

    connect();
    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [gameId]);

  const control = useCallback(
    async (action: "start" | "next" | "finish") => {
      if (!gameId) return;
      setBusyAction(action);
      setError(null);
      try {
        const res = await fetch(`/api/speed-game/games/${gameId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          setError(`액션 실패: ${await res.text()}`);
          return;
        }
        const data = (await res.json()) as { game?: SpeedGameWire };
        if (data.game) setGame(data.game);
        else await refresh();
      } catch {
        setError("액션 중 오류가 발생했습니다.");
      } finally {
        setBusyAction(null);
      }
    },
    [gameId, refresh],
  );

  const submitAnswer = useCallback(async () => {
    if (!gameId || !currentRound || !myGroup) return;
    const answer = answerDraft.trim();
    if (!answer) return;
    const elapsedMs = answerStartMsRef.current
      ? Date.now() - answerStartMsRef.current
      : 0;
    setAnswerSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/speed-game/games/${gameId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roundId: currentRound.id,
          groupId: myGroup.id,
          answer,
          elapsedMs,
        }),
      });
      if (!res.ok) {
        setError(`제출 실패: ${await res.text()}`);
        return;
      }
      const data = (await res.json()) as { answer?: SpeedGameAnswer };
      if (data.answer) {
        setGame((prev) => {
          if (!prev) return prev;
          const nextAnswers = prev.answers.filter((a) => a.id !== data.answer!.id);
          return { ...prev, answers: [...nextAnswers, data.answer!] };
        });
        setAnswerDraft("");
      }
      await refresh();
    } catch {
      setError("답변 제출 중 오류가 발생했습니다.");
    } finally {
      setAnswerSubmitting(false);
    }
  }, [gameId, currentRound, myGroup, answerDraft, refresh]);

  useEffect(() => {
    if (game?.status === "active" && currentRound && mySlot === currentRound.guesserSlot) {
      answerStartMsRef.current = Date.now();
    }
  }, [game?.status, currentRound, mySlot]);

  if (!game) {
    return (
      <section className="speed-game-board">
        <div className="speed-game-empty">
          <p>아직 생성된 스피드게임이 없어요.</p>
          {viewerKind === "teacher" && (
            <p className="speed-game-empty-hint">잠시 후 다시 시도하거나 페이지를 새로고침해 주세요.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="speed-game-board">
      <PlayBoardContinueButton
        href={viewerKind === "teacher" ? "/dashboard" : "/student"}
      />
      {error && <p className="speed-game-error">{error}</p>}

      {viewerKind === "none" && (
        <div className="speed-game-empty">
          <p>참여 권한이 없어요.</p>
        </div>
      )}

      {viewerKind === "teacher" && (
        <TeacherPanel
          game={game}
          currentRound={currentRound}
          busyAction={busyAction}
          onControl={control}
        />
      )}
      {viewerKind === "student" && (
        <StudentPanel
          game={game}
          currentRound={currentRound}
          myGroup={myGroup}
          mySlot={mySlot}
          myAnswer={myAnswerForCurrentRound}
          answerDraft={answerDraft}
          answerSubmitting={answerSubmitting}
          onAnswerChange={setAnswerDraft}
          onSubmit={submitAnswer}
        />
      )}
    </section>
  );
}

function TeacherPanel({
  game,
  currentRound,
  busyAction,
  onControl,
}: {
  game: SpeedGameWire;
  currentRound: SpeedGameRound | null;
  busyAction: string | null;
  onControl: (action: "start" | "next" | "finish") => void;
}) {
  const canStart = game.status === "waiting" && game.rounds.length > 0;
  const canNext = game.status === "active" && game.roundIndex < game.rounds.length - 1;
  const canFinish = game.status === "active" || game.status === "waiting";

  const groupSubmissionStatus = useMemo(() => {
    if (!currentRound) return [];
    return game.groups.map((group) => {
      const answer = game.answers.find(
        (a) => a.roundId === currentRound.id && a.groupId === group.id,
      );
      return { group, submitted: !!answer, answer };
    });
  }, [game.groups, game.answers, currentRound]);

  return (
    <div className="speed-game-teacher">
      <header className="speed-game-header">
        <div className="speed-game-status-row">
          <span className={`speed-game-status speed-game-status--${game.status}`}>
            {STATUS_LABELS[game.status]}
          </span>
          <span className="speed-game-round-count">
            라운드 {roundDisplayIndex(game.roundIndex)} / {game.rounds.length}
          </span>
        </div>
        {currentRound && game.status === "active" && (
          <div className="speed-game-current-round">
            <span className="speed-game-keyword-label">현재 단어</span>
            <strong className="speed-game-keyword">{currentRound.keyword}</strong>
            <span className="speed-game-guesser">추리 역할: {currentRound.guesserSlot}번 학생</span>
          </div>
        )}
      </header>

      <div className="speed-game-controls">
        <button
          type="button"
          className="speed-game-btn speed-game-btn-primary"
          onClick={() => onControl("start")}
          disabled={!canStart || !!busyAction}
        >
          {busyAction === "start" ? "시작하는 중…" : "게임 시작"}
        </button>
        <button
          type="button"
          className="speed-game-btn speed-game-btn-secondary"
          onClick={() => onControl("next")}
          disabled={!canNext || !!busyAction}
        >
          {busyAction === "next" ? "넘어가는 중…" : "다음 라운드"}
        </button>
        <button
          type="button"
          className="speed-game-btn speed-game-btn-danger"
          onClick={() => onControl("finish")}
          disabled={!canFinish || !!busyAction}
        >
          {busyAction === "finish" ? "종료하는 중…" : "게임 종료"}
        </button>
      </div>

      {currentRound && game.status !== "finished" && (
        <div className="speed-game-submissions">
          <h3>모둠 제출 현황</h3>
          {groupSubmissionStatus.length === 0 ? (
            <p className="speed-game-empty-hint">등록된 모둠이 없어요.</p>
          ) : (
            <ul className="speed-game-submission-list">
              {groupSubmissionStatus.map(({ group, submitted, answer }) => (
                <li key={group.id} className="speed-game-submission-item">
                  <span className="speed-game-group-name">{group.name}</span>
                  {submitted ? (
                    <span className="speed-game-submission-badge speed-game-submission-badge--submitted">
                      제출 완료
                      {answer?.answer ? ` · "${answer.answer}"` : ""}
                      {answer?.elapsedMs ? ` · ${formatDuration(answer.elapsedMs)}` : ""}
                    </span>
                  ) : (
                    <span className="speed-game-submission-badge speed-game-submission-badge--waiting">
                      대기 중
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Leaderboard leaderboard={game.leaderboard} />
    </div>
  );
}

function StudentPanel({
  game,
  currentRound,
  myGroup,
  mySlot,
  myAnswer,
  answerDraft,
  answerSubmitting,
  onAnswerChange,
  onSubmit,
}: {
  game: SpeedGameWire;
  currentRound: SpeedGameRound | null;
  myGroup: SpeedGameGroup | null;
  mySlot: number | null;
  myAnswer: SpeedGameAnswer | null;
  answerDraft: string;
  answerSubmitting: boolean;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!myGroup) {
    return (
      <div className="speed-game-student">
        <div className="speed-game-empty">
          <p>아직 모둠에 배정되지 않았어요.</p>
          <p className="speed-game-empty-hint">교사에게 모둠 배정을 요청해 주세요.</p>
        </div>
        <Leaderboard leaderboard={game.leaderboard} />
      </div>
    );
  }

  if (game.status === "waiting") {
    return (
      <div className="speed-game-student">
        <div className="speed-game-wait">
          <p>게임 시작을 기다리고 있어요.</p>
          <p className="speed-game-empty-hint">교사가 시작하면 화면이 바뀝니다.</p>
        </div>
        <Leaderboard leaderboard={game.leaderboard} />
      </div>
    );
  }

  if (game.status === "finished") {
    return (
      <div className="speed-game-student">
        <div className="speed-game-finished">
          <p>게임이 종료되었어요!</p>
        </div>
        <Leaderboard leaderboard={game.leaderboard} />
      </div>
    );
  }

  if (!currentRound) {
    return (
      <div className="speed-game-student">
        <div className="speed-game-wait">
          <p>라운드 정보를 불러오는 중이에요.</p>
        </div>
        <Leaderboard leaderboard={game.leaderboard} />
      </div>
    );
  }

  const isGuesser = mySlot === currentRound.guesserSlot;
  const submitted = !!myAnswer;

  return (
    <div className="speed-game-student">
      <div className="speed-game-student-meta">
        <span className="speed-game-group-name">{myGroup.name}</span>
        <span className="speed-game-round-count">
          라운드 {roundDisplayIndex(game.roundIndex)} / {game.rounds.length}
        </span>
      </div>

      {submitted ? (
        <div className="speed-game-submitted">
          <p>제출 완료!</p>
          {myAnswer && (
            <div className="speed-game-submitted-detail">
              <p>내 답변: <strong>{myAnswer.answer}</strong></p>
              {myAnswer.correct !== null && (
                <p className={myAnswer.correct ? "speed-game-correct" : "speed-game-wrong"}>
                  {myAnswer.correct ? "정답" : "오답"}
                </p>
              )}
              {myAnswer.score !== null && <p>점수: <strong>{myAnswer.score}</strong></p>}
              {myAnswer.rank !== null && <p>순위: <strong>{myAnswer.rank}</strong>등</p>}
            </div>
          )}
        </div>
      ) : isGuesser ? (
        <div className="speed-game-guesser">
          <p className="speed-game-role-hint">모둠원의 설명을 듣고 단어를 맞혀보세요!</p>
          <input
            type="text"
            className="speed-game-answer-input"
            value={answerDraft}
            onChange={(e) => onAnswerChange(e.target.value)}
            placeholder="정답을 입력하세요"
            maxLength={80}
            disabled={answerSubmitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
          <button
            type="button"
            className="speed-game-btn speed-game-btn-primary"
            onClick={onSubmit}
            disabled={!answerDraft.trim() || answerSubmitting}
          >
            {answerSubmitting ? "제출 중…" : "제출"}
          </button>
        </div>
      ) : (
        <div className="speed-game-explainer">
          <p className="speed-game-role-hint">당신은 설명자예요. 단어를 설명해 주세요!</p>
          <div className="speed-game-keyword-card">
            <span className="speed-game-keyword-label">설명할 단어</span>
            <strong className="speed-game-keyword">{currentRound.keyword}</strong>
          </div>
        </div>
      )}

      <Leaderboard leaderboard={game.leaderboard} />
    </div>
  );
}

function Leaderboard({ leaderboard }: { leaderboard: SpeedGameLeaderboardEntry[] }) {
  if (leaderboard.length === 0) return null;
  return (
    <div className="speed-game-leaderboard">
      <h3>리더보드</h3>
      <ol className="speed-game-leaderboard-list">
        {leaderboard.map((entry) => (
          <li key={entry.groupId} className="speed-game-leaderboard-item">
            <span className="speed-game-leaderboard-name">{entry.groupName}</span>
            <span className="speed-game-leaderboard-score">{entry.score}점</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
