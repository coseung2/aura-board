"use client";

// OMR-style student take view. Shows a bubble grid (question × choice)
// with a sticky timer. Answers auto-save with 300ms debounce. The exam
// text is on the printed paper - only the answer grid is digital.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssessmentTemplateStudentDTO } from "@/types/assessment";

// 10문항 이하는 1단. 11문항 이상은 2단으로 쪼갠다.
function splitIntoColumns(n: number): number[][] {
  if (n <= 10) return [Array.from({ length: n }, (_, i) => i)];
  const left = Math.ceil(n / 2);
  return [
    Array.from({ length: left }, (_, i) => i),
    Array.from({ length: n - left }, (_, i) => left + i),
  ];
}

type SubmissionRow = {
  id: string;
  status: "in_progress" | "submitted";
  startedAt: string;
  endAt: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      template: AssessmentTemplateStudentDTO;
      submission: SubmissionRow;
      clockSkewMs: number;
    };

export interface AssessmentTakeProps {
  templateId: string;
  onSubmitted: (submissionId: string) => void;
}

export function AssessmentTake({ templateId, onSubmitted }: AssessmentTakeProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const t = await fetch(`/api/assessment/templates/${templateId}`);
        if (!t.ok) throw new Error(`template_${t.status}`);
        const tjson = (await t.json()) as {
          template: AssessmentTemplateStudentDTO;
          viewer: string;
        };
        if (tjson.viewer !== "student") throw new Error("not_student");
        const s = await fetch(
          `/api/assessment/templates/${templateId}/submissions`,
          { method: "POST" }
        );
        if (!s.ok) throw new Error(`submission_${s.status}`);
        const sjson = (await s.json()) as {
          submission: SubmissionRow;
          serverTime: string;
        };
        if (cancelled) return;
        setState({
          kind: "ready",
          template: tjson.template,
          submission: sjson.submission,
          clockSkewMs: Date.now() - new Date(sjson.serverTime).getTime(),
        });
      } catch (e) {
        if (!cancelled)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "load_failed",
          });
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [templateId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const selectAnswer = useCallback(
    (questionId: string, choiceId: string) => {
      // 복수 정답 허용 - 같은 버블 재클릭 시 해제, 아니면 set 에 추가.
      const current = answers[questionId] ?? [];
      const nextSelected = current.includes(choiceId)
        ? current.filter((id) => id !== choiceId)
        : [...current, choiceId];
      setAnswers((prev) => {
        if (nextSelected.length === 0) {
          const copy = { ...prev };
          delete copy[questionId];
          return copy;
        }
        return { ...prev, [questionId]: nextSelected };
      });
      if (state.kind !== "ready") return;
      const submissionId = state.submission.id;
      clearTimeout(timers.current[questionId]);
      setSaveState("saving");
      timers.current[questionId] = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/assessment/submissions/${submissionId}/answer`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ questionId, selectedChoiceIds: nextSelected }),
            }
          );
          setSaveState(res.ok ? "saved" : "idle");
        } catch {
          setSaveState("idle");
        }
      }, 300);
    },
    [state, answers]
  );

  const saveManual = useCallback(
    (questionId: string, raw: string) => {
      // 수동채점은 자유 텍스트 - 공백/줄바꿈 유지. 500자 제한.
      const text = raw.slice(0, 500);
      setShortAnswers((prev) => ({ ...prev, [questionId]: text }));
      if (state.kind !== "ready") return;
      const submissionId = state.submission.id;
      clearTimeout(timers.current[questionId]);
      setSaveState("saving");
      timers.current[questionId] = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/assessment/submissions/${submissionId}/answer`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ questionId, textAnswer: text }),
            }
          );
          setSaveState(res.ok ? "saved" : "idle");
        } catch {
          setSaveState("idle");
        }
      }, 300);
    },
    [state]
  );

  const saveShort = useCallback(
    (questionId: string, raw: string) => {
      const cleaned = raw.replace(/\s+/g, "");
      setShortAnswers((prev) => ({ ...prev, [questionId]: cleaned }));
      if (state.kind !== "ready") return;
      const submissionId = state.submission.id;
      clearTimeout(timers.current[questionId]);
      setSaveState("saving");
      timers.current[questionId] = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/assessment/submissions/${submissionId}/answer`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ questionId, textAnswer: cleaned }),
            }
          );
          setSaveState(res.ok ? "saved" : "idle");
        } catch {
          setSaveState("idle");
        }
      }, 300);
    },
    [state]
  );

  async function handleSubmit() {
    if (state.kind !== "ready") return;
    if (!confirm("제출하면 수정할 수 없어요. 계속할까요?")) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/assessment/submissions/${state.submission.id}/submit`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      onSubmitted(state.submission.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "submit_failed");
    } finally {
      setSubmitting(false);
    }
  }

  const remainingSec = useMemo(() => {
    if (state.kind !== "ready") return 0;
    const endMs = new Date(state.submission.endAt).getTime() + state.clockSkewMs;
    return Math.max(0, Math.floor((endMs - now) / 1000));
  }, [state, now]);
  const expired = remainingSec === 0;
  const lowTime = remainingSec > 0 && remainingSec < 5 * 60;

  if (state.kind === "loading") {
    return <div className="assessment-take-loading">불러오는 중...</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="assessment-take-error" role="alert">
        ⚠ 평가를 불러오지 못했어요: {state.message}
      </div>
    );
  }

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");

  const totalCount = state.template.questions.length;
  const answeredCount = state.template.questions.filter((q) => {
    if (q.kind === "SHORT") return (shortAnswers[q.id] ?? "").length > 0;
    return (answers[q.id] ?? []).length > 0;
  }).length;
  // Derive column headers from the first MCQ question; fallback to 5-choice
  // layout if the template is all SHORT.
  const firstMcq = state.template.questions.find((q) => q.kind === "MCQ");
  const choiceHeaders = firstMcq?.kind === "MCQ" ? firstMcq.choices : [
    { id: "①", text: "①" },
    { id: "②", text: "②" },
    { id: "③", text: "③" },
    { id: "④", text: "④" },
    { id: "⑤", text: "⑤" },
  ];

  return (
    <div className="assessment-take">
      <div
        className={`assessment-take-timer${lowTime ? " is-low" : ""}${expired ? " is-expired" : ""}`}
        role="timer"
        aria-live="polite"
      >
        <span className="assessment-take-timer-icon">⏱</span>
        <span className="assessment-take-timer-value">{mm}:{ss}</span>
        <span className="assessment-take-timer-label">
          {expired ? "시간 종료 - 제출해주세요" : "남은 시간"}
        </span>
        <span className="assessment-take-save">
          {saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : ""}
        </span>
      </div>

      <h2 className="assessment-take-title">{state.template.title}</h2>

      <div className="omr-grid-wrap">
        {splitIntoColumns(state.template.questions.length).map((range, ci) => (
          <div key={ci} className="omr-grid">
            <div className="omr-grid-header">
              <div className="omr-grid-num">번호</div>
              <div className="omr-grid-kind">유형</div>
              {choiceHeaders.map((c) => (
                <div key={c.id} className="omr-grid-col-header">{c.id}</div>
              ))}
            </div>
            {range.map((qi) => {
              const q = state.template.questions[qi];
              return (
                <div key={q.id} className="omr-grid-row">
                  <div className="omr-grid-num">{qi + 1}</div>
                  <div
                    className={`omr-kind-chip omr-kind-chip-${q.kind === "MCQ" ? "mcq" : q.kind === "SHORT" ? "short" : "manual"} is-readonly`}
                    aria-label={`유형: ${q.kind === "MCQ" ? "객관식" : q.kind === "SHORT" ? "단답형" : "수동채점"}`}
                  >
                    {q.kind === "MCQ" ? "객" : q.kind === "SHORT" ? "단" : "수"}
                  </div>
                  {q.kind === "MCQ" ? (
                    q.choices.map((c) => {
                      const selected = answers[q.id] ?? [];
                      const filled = selected.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`omr-bubble${filled ? " is-filled" : ""}`}
                          onClick={() => selectAnswer(q.id, c.id)}
                          disabled={expired || submitting}
                          aria-label={`${qi + 1}번 ${c.id} ${filled ? "선택됨" : ""}`}
                        >
                          {filled ? "●" : "○"}
                        </button>
                      );
                    })
                  ) : q.kind === "SHORT" ? (
                    <div
                      className="omr-grid-short"
                      style={{ ["--choice-span" as string]: choiceHeaders.length }}
                    >
                      <input
                        type="text"
                        className="assessment-input omr-short-input"
                        placeholder="정답 (띄어쓰기 없이)"
                        value={shortAnswers[q.id] ?? ""}
                        onChange={(e) => saveShort(q.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === " ") e.preventDefault(); }}
                        maxLength={50}
                        disabled={expired || submitting}
                        aria-label={`${qi + 1}번 단답형 답안`}
                      />
                    </div>
                  ) : (
                    <div
                      className="omr-grid-short"
                      style={{ ["--choice-span" as string]: choiceHeaders.length }}
                    >
                      <textarea
                        className="assessment-input omr-manual-input"
                        placeholder="답 (자유 입력, 선생님이 채점)"
                        value={shortAnswers[q.id] ?? ""}
                        onChange={(e) => saveManual(q.id, e.target.value)}
                        maxLength={500}
                        disabled={expired || submitting}
                        aria-label={`${qi + 1}번 수동채점 답안`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="assessment-take-submit-bar">
        <span className="assessment-take-progress">
          {answeredCount}/{totalCount} 마킹됨
        </span>
        <button
          type="button"
          className="assessment-btn assessment-btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "제출 중..." : "제출"}
        </button>
      </div>
    </div>
  );
}
