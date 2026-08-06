"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  LiveQuizStateResponse,
  LiveQuizViewerKind,
} from "@/lib/live-quiz/contracts";
import { LiveQuizLivePanel } from "./LiveQuizLivePanel";
import { LiveQuizSuggestionPanel } from "./LiveQuizSuggestionPanel";
import styles from "./live-quiz.module.css";

type Props = {
  viewerKind: LiveQuizViewerKind;
  displayName: string;
  adminHref?: string;
};

type OptimisticAnswer = {
  questionId: string;
  choice: number;
};

function stateErrorMessage(status: number): string {
  if (status === 401) return "로그인이 필요합니다.";
  return "라이브 퀴즈 상태를 불러오지 못했습니다.";
}

export function LiveQuizExperience({
  viewerKind,
  displayName,
  adminHref,
}: Props) {
  const [activeTab, setActiveTab] = useState<"live" | "suggest">("live");
  const [state, setState] = useState<LiveQuizStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());
  const [answering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [optimisticAnswer, setOptimisticAnswer] =
    useState<OptimisticAnswer | null>(null);
  const stateRequestInFlightRef = useRef(false);
  const stateRefreshQueuedRef = useRef(false);

  const loadState = useCallback(async (silent = false) => {
    if (stateRequestInFlightRef.current) {
      stateRefreshQueuedRef.current = true;
      return;
    }

    let nextRequestSilent = silent;
    do {
      stateRefreshQueuedRef.current = false;
      stateRequestInFlightRef.current = true;
      if (!nextRequestSilent) setLoading(true);
      try {
        const response = await fetch("/api/live-quiz/state", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(stateErrorMessage(response.status));
        const body = (await response.json()) as LiveQuizStateResponse;
        setState(body);
        setServerOffsetMs(Date.parse(body.serverNow) - Date.now());
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "라이브 퀴즈 상태를 불러오지 못했습니다.",
        );
      } finally {
        stateRequestInFlightRef.current = false;
        if (!nextRequestSilent) setLoading(false);
      }
      nextRequestSilent = true;
    } while (stateRefreshQueuedRef.current);
  }, []);

  useEffect(() => {
    void loadState();
    const interval = window.setInterval(() => void loadState(true), 2_000);
    return () => window.clearInterval(interval);
  }, [loadState]);

  useEffect(() => {
    const interval = window.setInterval(() => setLocalNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const question = state?.question ?? null;
    const savedChoice = state?.selectedChoice ?? null;
    if (!question) {
      setOptimisticAnswer(null);
      setAnswerError(null);
      return;
    }
    setOptimisticAnswer((current) => {
      if (current?.questionId !== question.id) {
        return savedChoice === null
          ? null
          : { questionId: question.id, choice: savedChoice };
      }
      if (savedChoice !== null) {
        return { questionId: question.id, choice: savedChoice };
      }
      return current;
    });
  }, [state?.question, state?.selectedChoice]);

  const nowMs = localNowMs + serverOffsetMs;
  const activeQuestion = state?.question ?? null;
  const selectedChoice =
    activeQuestion && optimisticAnswer?.questionId === activeQuestion.id
      ? optimisticAnswer.choice
      : state?.selectedChoice ?? null;

  async function answer(choice: number) {
    const answerDeadlineMs = Date.parse(state?.stageEndsAt ?? "");
    if (
      !state?.question ||
      state.phase !== "live" ||
      state.stage !== "answer" ||
      !Number.isFinite(answerDeadlineMs) ||
      nowMs >= answerDeadlineMs ||
      selectedChoice !== null ||
      answering
    ) {
      if (
        state?.phase === "live" &&
        Number.isFinite(answerDeadlineMs) &&
        nowMs >= answerDeadlineMs
      ) {
        void loadState(true);
      }
      return;
    }

    const question = state.question;
    setOptimisticAnswer({ questionId: question.id, choice });
    setAnswering(true);
    setAnswerError(null);
    try {
      const response = await fetch("/api/live-quiz/answer", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sessionKey: state.sessionKey,
          questionId: question.id,
          selectedChoice: choice,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        selectedChoice?: number;
        error?: string;
      } | null;
      if (!response.ok || typeof body?.selectedChoice !== "number") {
        if (response.status === 409) {
          throw new Error("답변 시간이 끝났습니다. 다음 문제를 확인해 주세요.");
        }
        throw new Error("답을 저장하지 못했습니다. 다시 선택해 주세요.");
      }
      setOptimisticAnswer({
        questionId: question.id,
        choice: body.selectedChoice,
      });
      void loadState(true);
    } catch (error) {
      setOptimisticAnswer(null);
      setAnswerError(
        error instanceof Error
          ? error.message
          : "답을 저장하지 못했습니다. 다시 선택해 주세요.",
      );
      void loadState(true);
    } finally {
      setAnswering(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={`${styles.shell} ${styles.hero}`}>
        <div>
          <div className={styles.liveLine}>
            <span className={styles.liveBadge}>LIVE</span>
            <span>매일 오후 1:30 · 전체 이용자</span>
          </div>
          <h1>오늘의 라이브 퀴즈</h1>
          <p>
            진행자 없이 같은 시각에 모두가 함께 푸는 4지선다 퀴즈예요.
          </p>
        </div>
        <div className={styles.viewerCard}>
          <span>{viewerKind === "student" ? "학생 참가자" : "교사 참가자"}</span>
          <strong>{displayName}</strong>
        </div>
      </header>

      <nav
        className={`${styles.shell} ${styles.tabs}`}
        aria-label="라이브 퀴즈 메뉴"
      >
        <button
          type="button"
          className={activeTab === "live" ? styles.activeTab : undefined}
          aria-current={activeTab === "live" ? "page" : undefined}
          onClick={() => setActiveTab("live")}
        >
          라이브 퀴즈
        </button>
        <button
          type="button"
          className={activeTab === "suggest" ? styles.activeTab : undefined}
          aria-current={activeTab === "suggest" ? "page" : undefined}
          onClick={() => setActiveTab("suggest")}
        >
          문제 추천
        </button>
      </nav>

      {activeTab === "live" ? (
        <LiveQuizLivePanel
          contentClassName={styles.shell}
          state={state}
          loading={loading}
          loadError={loadError}
          nowMs={nowMs}
          selectedChoice={selectedChoice}
          answering={answering}
          answerError={answerError}
          adminHref={adminHref}
          onRetry={() => void loadState()}
          onAnswer={(choice) => void answer(choice)}
          onSuggest={() => setActiveTab("suggest")}
        />
      ) : (
        <LiveQuizSuggestionPanel
          contentClassName={styles.shell}
          displayName={displayName}
        />
      )}
    </main>
  );
}
