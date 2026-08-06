"use client";

import type { LiveQuizStateResponse } from "@/lib/live-quiz/contracts";
import {
  LIVE_QUIZ_ANSWER_SECONDS,
  LIVE_QUIZ_REVEAL_SECONDS,
} from "@/lib/live-quiz/schedule";

import styles from "./live-quiz.module.css";

const OPTION_LABELS = ["A", "B", "C", "D"] as const;

function secondsUntil(target: string | null, nowMs: number): number {
  if (!target) return 0;
  return Math.max(0, Math.ceil((Date.parse(target) - nowMs) / 1000));
}

function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatKoreanDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function panelClassName(contentClassName: string, panelClassName: string): string {
  return `${contentClassName} ${panelClassName}`;
}

type LivePanelProps = {
  contentClassName: string;
  state: LiveQuizStateResponse | null;
  loading: boolean;
  loadError: string | null;
  nowMs: number;
  selectedChoice: number | null;
  answering: boolean;
  answerError: string | null;
  adminHref?: string;
  onRetry: () => void;
  onAnswer: (choice: number) => void;
  onSuggest: () => void;
};

export function LiveQuizLivePanel({
  contentClassName,
  state,
  loading,
  loadError,
  nowMs,
  selectedChoice,
  answering,
  answerError,
  adminHref,
  onRetry,
  onAnswer,
  onSuggest,
}: LivePanelProps) {
  if (loading && !state) {
    return (
      <section
        className={panelClassName(contentClassName, styles.stateCard)}
        aria-busy="true"
      >
        <div className={styles.skeletonTitle} />
        <div className={styles.skeletonBody} />
      </section>
    );
  }

  if (loadError && !state) {
    return (
      <section
        className={panelClassName(contentClassName, styles.stateCard)}
        role="alert"
      >
        <span className={styles.stateIcon} aria-hidden>
          ⚠️
        </span>
        <h2>연결을 확인해 주세요</h2>
        <p>{loadError}</p>
        <button type="button" className={styles.primaryButton} onClick={onRetry}>
          다시 불러오기
        </button>
      </section>
    );
  }

  if (!state) return null;

  if (state.phase === "setup") {
    return (
      <section className={panelClassName(contentClassName, styles.stateCard)}>
        <span className={styles.stateIcon} aria-hidden>
          🧩
        </span>
        <p className={styles.eyebrow}>방송 준비 중</p>
        <h2>승인된 문제를 모으고 있어요</h2>
        <p>{state.setupReason}</p>
        <div className={styles.stateActions}>
          <button type="button" className={styles.primaryButton} onClick={onSuggest}>
            문제 추천하기
          </button>
          {adminHref ? (
            <a className={styles.secondaryButton} href={adminHref}>
              문제 검수하기
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  if (state.phase === "waiting") {
    const countdown = secondsUntil(state.startsAt, nowMs);
    return (
      <section className={panelClassName(contentClassName, styles.waitingCard)}>
        <div className={styles.waitingPulse} aria-hidden>
          <span />
        </div>
        <p className={styles.eyebrow}>다음 방송</p>
        <h2>{formatKoreanDateTime(state.startsAt)}</h2>
        <p className={styles.countdownLabel}>시작까지</p>
        <strong className={styles.countdown} aria-live="polite">
          {formatCountdown(countdown)}
        </strong>
        <div className={styles.waitingFacts}>
          <span>오늘 {state.questionCount}문제</span>
          <span>문제당 20초</span>
          <span>자동 입장</span>
        </div>
        <p className={styles.mutedText}>
          화면을 켜 두면 오후 1시 30분에 첫 문제가 자동으로 열립니다.
        </p>
      </section>
    );
  }

  if (state.phase === "finished") {
    return (
      <section className={panelClassName(contentClassName, styles.resultCard)}>
        <p className={styles.eyebrow}>오늘 방송 종료</p>
        <h2>수고했어요!</h2>
        <div className={styles.finalScore}>
          <strong>{state.score}</strong>
          <span>/ {state.questionCount} 정답</span>
        </div>
        <p>
          {state.answeredCount}문제에 답했어요. 다음 방송은{" "}
          <strong>{formatKoreanDateTime(state.nextStartsAt)}</strong>입니다.
        </p>
        <button type="button" className={styles.primaryButton} onClick={onSuggest}>
          다음 방송 문제 추천하기
        </button>
      </section>
    );
  }

  if (!state.question || !state.stage || state.questionNumber === null) {
    return null;
  }

  const question = state.question;
  const remainingSeconds = secondsUntil(state.stageEndsAt, nowMs);
  const stageSeconds =
    state.stage === "answer"
      ? LIVE_QUIZ_ANSWER_SECONDS
      : LIVE_QUIZ_REVEAL_SECONDS;
  const timerPercent = Math.max(
    0,
    Math.min(100, (remainingSeconds / stageSeconds) * 100),
  );
  const reveal = state.stage === "reveal";
  const answerWindowOpen =
    !reveal &&
    state.stageEndsAt !== null &&
    nowMs < Date.parse(state.stageEndsAt);

  return (
    <section
      className={panelClassName(contentClassName, styles.quizCard)}
      aria-live="polite"
    >
      <div className={styles.quizMeta}>
        <div>
          <span className={styles.questionIndex}>
            Q {state.questionNumber} / {state.questionCount}
          </span>
          {question.category ? (
            <span className={styles.category}>{question.category}</span>
          ) : null}
        </div>
        <div className={styles.scoreBox}>
          <span>현재 점수</span>
          <strong>{state.score}</strong>
        </div>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <span
          style={{
            width: `${(state.questionNumber / state.questionCount) * 100}%`,
          }}
        />
      </div>

      <div className={styles.timerRow}>
        <span>{reveal ? "정답 공개" : "남은 시간"}</span>
        <strong>{remainingSeconds}</strong>
      </div>
      <div className={styles.timerTrack} aria-hidden>
        <span style={{ width: `${timerPercent}%` }} />
      </div>

      <h2 className={styles.prompt}>{question.prompt}</h2>

      <div className={styles.options}>
        {question.choices.map((choice, index) => {
          const correct = reveal && index === state.correctChoice;
          const chosen = index === selectedChoice;
          const wrongChosen = reveal && chosen && !correct;
          const className = [
            styles.option,
            chosen ? styles.chosenOption : "",
            correct ? styles.correctOption : "",
            wrongChosen ? styles.wrongOption : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={`${question.id}-${index}`}
              type="button"
              className={className}
              disabled={!answerWindowOpen || selectedChoice !== null || answering}
              aria-pressed={chosen}
              onClick={() => {
                if (answerWindowOpen) onAnswer(index);
              }}
            >
              <span className={styles.optionLabel}>{OPTION_LABELS[index]}</span>
              <span>{choice}</span>
              {correct ? <span className={styles.optionResult}>정답</span> : null}
              {wrongChosen ? (
                <span className={styles.optionResult}>내 선택</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={styles.answerStatus}>
        {answerError ? <p role="alert">{answerError}</p> : null}
        {!answerError && !reveal && selectedChoice !== null ? (
          <p>선택 완료 · 정답 공개를 기다려 주세요.</p>
        ) : null}
        {!answerError && answerWindowOpen && selectedChoice === null ? (
          <p>가장 알맞은 답 하나를 선택하세요.</p>
        ) : null}
        {!answerError && !reveal && !answerWindowOpen && selectedChoice === null ? (
          <p>답변이 마감됐어요. 정답 공개를 기다려 주세요.</p>
        ) : null}
        {reveal && state.isCorrect === true ? (
          <p className={styles.correctMessage}>정답입니다! 🎉</p>
        ) : null}
        {reveal && state.isCorrect === false ? (
          <p className={styles.wrongMessage}>아쉬워요. 다음 문제에 도전해요.</p>
        ) : null}
        {reveal && state.isCorrect === null ? (
          <p>이번 문제에는 답하지 않았어요.</p>
        ) : null}
      </div>

      {reveal && state.explanation ? (
        <div className={styles.explanation}>
          <strong>한 줄 해설</strong>
          <p>{state.explanation}</p>
        </div>
      ) : null}

      <p className={styles.answerCount}>현재 {state.activeAnswerCount}명 응답</p>
      {loadError ? <p className={styles.pollWarning}>{loadError}</p> : null}
    </section>
  );
}
