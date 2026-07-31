"use client";

import { useEffect, useRef, useState } from "react";
import type { AssessmentResultPayload } from "@/types/assessment";

// Student-only post-submit view. A visible-tab fallback checks /result until
// the teacher releases the gradebook entry; hidden tabs pause the checks.
const RELEASE_CHECK_MS = 10_000;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AssessmentResultPayload };

export interface AssessmentResultProps {
  submissionId: string;
}

export function AssessmentResult({ submissionId }: AssessmentResultProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const releasedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: Promise<void> | null = null;
    releasedRef.current = false;

    function stopTimer() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    }

    function scheduleNextCheck() {
      if (
        cancelled ||
        releasedRef.current ||
        document.visibilityState !== "visible" ||
        timer
      ) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        if (
          cancelled ||
          releasedRef.current ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        void load().then(scheduleNextCheck, scheduleNextCheck);
      }, RELEASE_CHECK_MS);
    }

    function load(): Promise<void> {
      if (inFlight) return inFlight;
      const request = (async () => {
        try {
          const res = await fetch(
            `/api/assessment/submissions/${submissionId}/result`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as AssessmentResultPayload;
          releasedRef.current = data.released;
          if (!cancelled) {
            setState({ kind: "ready", data });
            if (data.released) stopTimer();
          }
        } catch (e) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: e instanceof Error ? e.message : "load_failed",
            });
          }
        }
      })();
      inFlight = request;
      request.then(
        () => {
          if (inFlight === request) inFlight = null;
        },
        () => {
          if (inFlight === request) inFlight = null;
        },
      );
      return request;
    }

    function checkVisible() {
      if (document.visibilityState !== "visible") {
        stopTimer();
        return;
      }
      if (!releasedRef.current) void load().then(scheduleNextCheck, scheduleNextCheck);
    }

    void load().then(scheduleNextCheck, scheduleNextCheck);
    window.addEventListener("focus", checkVisible);
    document.addEventListener("visibilitychange", checkVisible);
    return () => {
      cancelled = true;
      stopTimer();
      window.removeEventListener("focus", checkVisible);
      document.removeEventListener("visibilitychange", checkVisible);
    };
  }, [submissionId]);

  if (state.kind === "loading") {
    return <div className="assessment-result-loading">불러오는 중...</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="assessment-result-error" role="alert">
        ⚠ 결과를 불러오지 못했어요
      </div>
    );
  }
  const { data } = state;
  if (!data.released) {
    return (
      <div className="assessment-result-pending">
        <div className="assessment-result-icon">📭</div>
        <div className="assessment-result-title">결과 공개 대기 중</div>
        <div className="assessment-result-sub">
          선생님이 공개하면 자동으로 여기에 표시돼요.
        </div>
      </div>
    );
  }

  return (
    <div className="assessment-result">
      <div className="assessment-result-score">
        <div className="assessment-result-score-value">
          {data.finalScore} / {data.maxScoreTotal}
        </div>
        <div className="assessment-result-score-label">점</div>
      </div>
      <ol className="assessment-result-questions">
        {data.questions.map((q, i) => (
          <li
            key={q.id}
            className={`assessment-result-question assessment-result-question-${
              q.correct ? "correct" : "wrong"
            }`}
          >
            <div className="assessment-result-q-head">
              <span className="assessment-result-q-num">{i + 1}.</span>
              <span className="assessment-result-q-verdict">
                {q.correct ? "🟢 정답" : "🔴 오답"}
              </span>
            </div>
            <div className="assessment-result-q-prompt">{q.prompt}</div>
            {q.kind === "MCQ" ? (
              <div className="assessment-result-q-detail">
                내 답: {q.selectedChoiceIds.length === 0
                  ? "(선택 안 함)"
                  : q.selectedChoiceIds
                      .map((cid) => q.choices.find((c) => c.id === cid)?.text ?? cid)
                      .join(", ")}
                {!q.correct && (
                  <>
                    {" "}
                    → 정답:{" "}
                    {q.correctChoiceIds
                      .map((cid) => q.choices.find((c) => c.id === cid)?.text ?? cid)
                      .join(", ")}
                  </>
                )}
              </div>
            ) : q.kind === "SHORT" ? (
              <div className="assessment-result-q-detail">
                내 답: {q.textAnswer || "(입력 안 함)"}
                {!q.correct && q.correctAnswers.length > 0 && (
                  <> → 정답: {q.correctAnswers.join(", ")}</>
                )}
              </div>
            ) : (
              <div className="assessment-result-q-detail">
                내 답: {q.textAnswer || "(입력 안 함)"}
                {" · "}
                선생님 채점: {q.manualScore}/{q.maxScore}점
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
