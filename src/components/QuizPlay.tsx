"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuizRealtime } from "@/features/quiz/useQuizRealtime";
import type {
  QuizRealtimeQuestion,
  QuizRealtimeSnapshot,
} from "@/features/quiz/realtime";

type Question = {
  id: string;
  text: string;
  options: string[];
  timeLimit: number;
};
type QResult = {
  correct: boolean;
  correctIndex: number;
  points: number;
  rank: number;
  totalPlayers: number;
};
type Player = { id: string; nickname: string; score: number };
type GameState =
  | { phase: "join" }
  | { phase: "waiting"; playerCount: number }
  | {
      phase: "question";
      question: Question;
      questionIndex: number;
      totalQuestions: number;
    }
  | { phase: "answered" }
  | { phase: "result"; result: QResult }
  | {
      phase: "leaderboard";
      players: Player[];
      myScore: number;
      myRank: number;
    };

const SHAPES = ["▲", "◆", "●", "■"];
const LABELS = ["A", "B", "C", "D"];

export function QuizPlay({
  initialCode,
  studentName,
  studentId,
}: {
  initialCode?: string;
  studentName?: string;
  studentId?: string;
}) {
  const [code, setCode] = useState(initialCode ?? "");
  const [nickname, setNickname] = useState(studentName ?? "");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [state, setState] = useState<GameState>({ phase: "join" });
  const [myScore, setMyScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastQuestionIndexRef = useRef(-1);
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;

  const clearQuestionTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const beginQuestion = useCallback(
    (question: QuizRealtimeQuestion) => {
      if (question.index === lastQuestionIndexRef.current) return;
      lastQuestionIndexRef.current = question.index;
      setSelected(null);
      setState({
        phase: "question",
        question: {
          id: question.id,
          text: question.text,
          options: question.options,
          timeLimit: question.timeLimit,
        },
        questionIndex: question.index,
        totalQuestions: question.total,
      });
      setTimeLeft(question.timeLimit);
      clearQuestionTimer();
      timerRef.current = setInterval(() => {
        setTimeLeft((current) => {
          if (current <= 1) {
            clearQuestionTimer();
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    },
    [clearQuestionTimer],
  );

  const applySnapshot = useCallback(
    (snapshot: QuizRealtimeSnapshot) => {
      const currentPlayer = snapshot.players.find(
        (player) => player.id === playerIdRef.current,
      );
      if (currentPlayer) setMyScore(currentPlayer.score);

      if (snapshot.status === "finished") {
        clearQuestionTimer();
        const rank = Math.max(
          1,
          snapshot.players.findIndex(
            (player) => player.id === playerIdRef.current,
          ) + 1,
        );
        setState({
          phase: "leaderboard",
          players: snapshot.players,
          myScore: currentPlayer?.score ?? 0,
          myRank: rank,
        });
        return;
      }

      if (snapshot.status === "waiting") {
        setState((current) =>
          current.phase === "join"
            ? current
            : { phase: "waiting", playerCount: snapshot.players.length },
        );
        return;
      }

      if (snapshot.currentQuestion) {
        beginQuestion(snapshot.currentQuestion);
      }
    },
    [beginQuestion, clearQuestionTimer],
  );

  const { onlineCount, realtimeReady } = useQuizRealtime({
    quizId,
    playerId,
    onSnapshot: applySnapshot,
  });

  useEffect(() => {
    if (!realtimeReady) return;
    setState((current) =>
      current.phase === "waiting"
        ? { phase: "waiting", playerCount: onlineCount }
        : current,
    );
  }, [onlineCount, realtimeReady]);

  useEffect(() => () => clearQuestionTimer(), [clearQuestionTimer]);

  // Auto-join for students with an authenticated classroom session.
  useEffect(() => {
    if (!studentId || !studentName || !initialCode || state.phase !== "join") {
      return;
    }
    setJoining(true);
    fetch("/api/quiz/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomCode: initialCode.toUpperCase(),
        studentId,
      }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.player) return;
        setPlayerId(payload.player.id);
        setQuizId(payload.quiz.id);
        setState({
          phase: "waiting",
          playerCount: payload.snapshot?.players?.length ?? 0,
        });
        if (payload.snapshot) {
          applySnapshot(payload.snapshot as QuizRealtimeSnapshot);
        }
      })
      .catch(() => undefined)
      .finally(() => setJoining(false));
    // Auto-join must only run for the initial authenticated session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, studentName, initialCode]);

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || !nickname.trim()) return;
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/quiz/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode: code.trim().toUpperCase(),
          nickname: nickname.trim(),
          studentId: studentId || undefined,
        }),
      });
      if (!response.ok) {
        setError((await response.text()) || "입장에 실패했습니다.");
        return;
      }
      const payload = await response.json();
      const nextPlayerId = payload.player?.id ?? payload.playerId;
      const nextQuizId = payload.quiz?.id ?? payload.quizId;
      setPlayerId(nextPlayerId);
      setQuizId(nextQuizId);
      setState({
        phase: "waiting",
        playerCount:
          payload.snapshot?.players?.length ?? payload.playerCount ?? 0,
      });
      if (payload.snapshot) {
        applySnapshot(payload.snapshot as QuizRealtimeSnapshot);
      }
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setJoining(false);
    }
  }

  async function handleAnswer(index: number) {
    if (selected !== null || !quizId || !playerId) return;
    const questionId =
      state.phase === "question" ? state.question.id : undefined;
    const timeLimitSec =
      state.phase === "question" ? state.question.timeLimit : 0;
    const selectedLetter = LABELS[index];
    const timeMs = (timeLimitSec - timeLeft) * 1000;
    setSelected(index);
    setState({ phase: "answered" });

    try {
      const response = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId,
          playerId,
          selected: selectedLetter,
          timeMs,
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        correct: boolean;
        correctAnswer: string;
        points: number;
        snapshot?: QuizRealtimeSnapshot | null;
      };
      const snapshot = payload.snapshot;
      if (snapshot) {
        const rank = Math.max(
          1,
          snapshot.players.findIndex((player) => player.id === playerId) + 1,
        );
        const score =
          snapshot.players.find((player) => player.id === playerId)?.score ??
          myScore + payload.points;
        setMyScore(score);
        setState({
          phase: "result",
          result: {
            correct: payload.correct,
            correctIndex: Math.max(0, LABELS.indexOf(payload.correctAnswer)),
            points: payload.points,
            rank,
            totalPlayers: snapshot.players.length,
          },
        });
      }
    } catch {
      // Broadcast/fallback snapshot will continue the game on the next state.
    }
  }

  if (state.phase === "join") {
    return (
      <div className="quiz-join">
        <h1 className="quiz-join-title">퀴즈 참가</h1>
        <form className="quiz-join-form" onSubmit={handleJoin}>
          <input
            className="quiz-join-input code-input"
            placeholder="참가 코드"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={8}
            autoFocus
          />
          <input
            className="quiz-join-input"
            placeholder="닉네임"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
          />
          {error && (
            <div
              style={{
                color: "var(--color-danger)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            className="quiz-join-btn"
            disabled={joining || !code.trim() || !nickname.trim()}
          >
            {joining ? "입장 중..." : "입장"}
          </button>
        </form>
      </div>
    );
  }

  if (state.phase === "waiting") {
    return (
      <div className="quiz-play">
        <div className="quiz-waiting">
          <div className="quiz-waiting-icon">⏳</div>
          <div className="quiz-waiting-text">
            선생님이 시작할 때까지 기다려주세요
          </div>
          <div className="quiz-waiting-sub">
            현재 {state.playerCount}명 접속 중
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "question") {
    const {
      question,
      questionIndex,
      totalQuestions,
    } = state;
    return (
      <div className="quiz-play">
        <div className="quiz-play-header">
          <span className="quiz-play-nickname">{nickname}</span>
          <span className="quiz-play-score">{myScore}점</span>
        </div>
        <div className="quiz-timer-bar">
          <div
            className={`quiz-timer-fill ${
              timeLeft <= 5 ? "danger" : timeLeft <= 10 ? "warning" : ""
            }`}
            style={
              { "--timer-duration": `${question.timeLimit}s` } as React.CSSProperties
            }
          />
        </div>
        <div className="quiz-timer-text">{timeLeft}초</div>
        <div className="quiz-question">
          <div className="quiz-question-number">
            문제 {questionIndex + 1} / {totalQuestions}
          </div>
          <div className="quiz-question-text">{question.text}</div>
        </div>
        <div className="quiz-options">
          {question.options.map((option, index) => (
            <button
              key={index}
              type="button"
              className={`quiz-option-btn quiz-option-${["a", "b", "c", "d"][index]}`}
              onClick={() => handleAnswer(index)}
              disabled={timeLeft === 0}
            >
              <span className="quiz-option-shape">{SHAPES[index]}</span>
              {option}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (state.phase === "answered") {
    return (
      <div className="quiz-play">
        <div className="quiz-waiting">
          <div className="quiz-waiting-icon">🤔</div>
          <div className="quiz-waiting-text">채점 중...</div>
          {selected !== null && (
            <div className="quiz-waiting-sub">
              선택: {SHAPES[selected]} {LABELS[selected]}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === "result") {
    const result = state.result;
    return (
      <div className="quiz-play">
        <div className="quiz-result">
          <div className="quiz-result-icon">
            {result.correct ? "🎉" : "😢"}
          </div>
          <div
            className={`quiz-result-text ${
              result.correct ? "quiz-result-correct" : "quiz-result-wrong"
            }`}
          >
            {result.correct ? "정답!" : "오답"}
          </div>
          <div className="quiz-result-points">+{result.points}점</div>
          <div className="quiz-result-rank">
            현재 {result.rank}위 / {result.totalPlayers}명
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "leaderboard") {
    const { players, myRank } = state;
    const top = players.slice(0, 3);
    return (
      <div className="quiz-play">
        <div className="quiz-leaderboard">
          <div className="quiz-leaderboard-title">최종 순위</div>
          {top.length >= 2 && (
            <div className="quiz-podium">
              <div className="quiz-podium-slot">
                <div className="quiz-podium-name">{top[1]?.nickname}</div>
                <div className="quiz-podium-bar quiz-podium-bar-2">2</div>
                <div className="quiz-podium-score">{top[1]?.score}점</div>
              </div>
              <div className="quiz-podium-slot">
                <div className="quiz-podium-name">{top[0]?.nickname}</div>
                <div className="quiz-podium-bar quiz-podium-bar-1">1</div>
                <div className="quiz-podium-score">{top[0]?.score}점</div>
              </div>
              {top[2] && (
                <div className="quiz-podium-slot">
                  <div className="quiz-podium-name">{top[2].nickname}</div>
                  <div className="quiz-podium-bar quiz-podium-bar-3">3</div>
                  <div className="quiz-podium-score">{top[2].score}점</div>
                </div>
              )}
            </div>
          )}
          <div className="quiz-leaderboard-list">
            {players.map((player, index) => (
              <div
                key={player.id}
                className="quiz-leaderboard-row"
                style={
                  player.id === playerId
                    ? { outline: "2px solid var(--color-accent)" }
                    : undefined
                }
              >
                <span className="quiz-leaderboard-rank">
                  {index === 0
                    ? "🥇"
                    : index === 1
                      ? "🥈"
                      : index === 2
                        ? "🥉"
                        : `${index + 1}`}
                </span>
                <span className="quiz-leaderboard-name">
                  {player.nickname}
                </span>
                <span className="quiz-leaderboard-score">
                  {player.score}점
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              textAlign: "center",
              marginTop: 16,
              color: "var(--color-text-muted)",
              fontSize: 14,
            }}
          >
            당신의 순위: {myRank}위
          </div>
        </div>
      </div>
    );
  }

  return null;
}
