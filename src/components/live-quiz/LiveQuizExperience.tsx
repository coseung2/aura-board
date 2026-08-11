"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  estimateServerOffsetMs,
  createLiveQuizCounterAccumulator,
  liveQuizBoundaryTarget,
  mergeLiveQuizCounterShard,
  mergeCachedLiveQuizAnswerCount,
  parseLiveQuizRealtimeCounter,
} from "@/lib/live-quiz/client-sync";
import type {
  LiveQuizStateResponse,
  LiveQuizViewerKind,
} from "@/lib/live-quiz/contracts";
import { getLiveQuizRealtimeClient } from "@/lib/live-quiz/realtime-client";
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

function realtimeChannelSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
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
  const realtimeCountersRef = useRef(createLiveQuizCounterAccumulator());
  const counterRenderFrameRef = useRef<number | null>(null);
  const boundaryRefreshKeyRef = useRef<string | null>(null);

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
        const requestStartedAtMs = Date.now();
        const response = await fetch("/api/live-quiz/state", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        const responseReceivedAtMs = Date.now();
        if (!response.ok) throw new Error(stateErrorMessage(response.status));
        const body = (await response.json()) as LiveQuizStateResponse;
        setState(
          mergeCachedLiveQuizAnswerCount(
            body,
            realtimeCountersRef.current.totals,
          ),
        );
        const nextServerOffsetMs = estimateServerOffsetMs(
          body.serverNow,
          requestStartedAtMs,
          responseReceivedAtMs,
        );
        if (nextServerOffsetMs !== null) {
          setServerOffsetMs(nextServerOffsetMs);
        }
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

  // One initial snapshot only. Subsequent changes arrive through Realtime or a
  // single server-time boundary refresh; there is no repeating state request.
  useEffect(() => {
    void loadState();
  }, [loadState]);

  // This timer repaints the local countdown only. It never calls the server.
  useEffect(() => {
    let timeoutId = 0;
    const tick = () => {
      setLocalNowMs(Date.now());
      timeoutId = window.setTimeout(tick, 250);
    };
    timeoutId = window.setTimeout(tick, 250);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // The schedule itself is deterministic. Fetch exactly once after a start,
  // answer, reveal, or next-broadcast boundary so the server can disclose the
  // next safe state without continuous polling.
  useEffect(() => {
    if (!state) return;

    const target = liveQuizBoundaryTarget(state);
    if (!target) return;

    const targetMs = Date.parse(target);
    if (!Number.isFinite(targetMs)) return;

    const boundaryKey = [
      state.sessionKey,
      state.questionNumber ?? "waiting",
      state.stage ?? state.phase,
      target,
    ].join(":");
    if (boundaryRefreshKeyRef.current === boundaryKey) return;

    const serverNowMs = Date.now() + serverOffsetMs;
    const delayMs = Math.max(0, targetMs - serverNowMs) + 250;
    const timeoutId = window.setTimeout(() => {
      boundaryRefreshKeyRef.current = boundaryKey;
      void loadState(true);
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [loadState, serverOffsetMs, state]);

  // Supabase Realtime carries only safe projection rows. Internal answers,
  // participant IDs, correct choices, and explanations are never published.
  useEffect(() => {
    const sessionKey = state?.sessionKey;
    if (!sessionKey) return;

    const client = getLiveQuizRealtimeClient();
    if (!client) return;

    realtimeCountersRef.current = createLiveQuizCounterAccumulator();
    let cancelled = false;
    let hasSubscribed = false;
    let needsReconnectSync = false;
    const reconcileCounterState = () => {
      if (cancelled) return;
      if (counterRenderFrameRef.current !== null) return;
      counterRenderFrameRef.current = window.requestAnimationFrame(() => {
        counterRenderFrameRef.current = null;
        if (cancelled) return;
        setState((current) =>
          current
            ? mergeCachedLiveQuizAnswerCount(
                current,
                realtimeCountersRef.current.totals,
              )
            : current,
        );
      });
    };
    const seedCounterSnapshot = async () => {
      const { data, error } = await client
        .from("LiveQuizQuestionCounterShard")
        .select("sessionKey,questionId,shard,answerCount")
        .eq("sessionKey", sessionKey);
      if (cancelled) return;
      if (error) {
        void loadState(true);
        return;
      }
      for (const row of data ?? []) {
        const counter = parseLiveQuizRealtimeCounter(row);
        if (counter) {
          mergeLiveQuizCounterShard(counter, realtimeCountersRef.current);
        }
      }
      reconcileCounterState();
    };
    const channel = client
      .channel(`live-quiz:${sessionKey}:${realtimeChannelSuffix()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "LiveQuizPublicSession",
          filter: `sessionKey=eq.${sessionKey}`,
        },
        () => {
          if (cancelled) return;
          void loadState(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "LiveQuizQuestionCounterShard",
          filter: `sessionKey=eq.${sessionKey}`,
        },
        (payload) => {
          if (cancelled) return;
          const counter = parseLiveQuizRealtimeCounter(payload.new);
          if (!counter || counter.sessionKey !== sessionKey) return;

          mergeLiveQuizCounterShard(counter, realtimeCountersRef.current);
          reconcileCounterState();
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          const reconnecting = needsReconnectSync;
          const shouldReconcile = !hasSubscribed || reconnecting;
          hasSubscribed = true;
          needsReconnectSync = false;
          if (shouldReconcile) {
            void seedCounterSnapshot();
            if (reconnecting) void loadState(true);
          }
          return;
        }
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          needsReconnectSync = true;
        }
      });

    return () => {
      cancelled = true;
      if (counterRenderFrameRef.current !== null) {
        window.cancelAnimationFrame(counterRenderFrameRef.current);
        counterRenderFrameRef.current = null;
      }
      void client.removeChannel(channel);
    };
  }, [loadState, state?.sessionKey]);

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
      // The database trigger increments the public counter and Realtime delivers
      // that aggregate to every participant, including this client.
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
