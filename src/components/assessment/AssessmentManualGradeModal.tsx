"use client";

// Teacher-only modal for grading MANUAL questions. Loaded with the
// per-question queue from /api/.../manual-queue - shows one MANUAL
// question at a time with every submitted student's answer. Teacher
// taps [오답]/[정답] per row. PATCHes /api/assessment/submissions/
// [sid]/manual with { questionId, correct }. After all items in the
// current question are graded the 다음 문항 button advances.

import { useCallback, useEffect, useState } from "react";
import type { ManualQueuePayload } from "@/types/assessment";

export interface AssessmentManualGradeModalProps {
  templateId: string;
  startQuestionId?: string;
  startSubmissionId?: string;
  onClose: () => void;
  onChanged: () => void; // parent refetches gradebook
}

export function AssessmentManualGradeModal({
  templateId,
  startQuestionId,
  startSubmissionId,
  onClose,
  onChanged,
}: AssessmentManualGradeModalProps) {
  const [queue, setQueue] = useState<ManualQueuePayload | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null); // submissionId being saved
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/assessment/templates/${templateId}/manual-queue`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ManualQueuePayload;
      setQueue(data);
      if (startQuestionId) {
        const idx = data.items.findIndex((it) => it.questionId === startQuestionId);
        if (idx >= 0) setActiveIdx(idx);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, [templateId, startQuestionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function grade(
    submissionId: string,
    questionId: string,
    correct: boolean
  ) {
    setBusy(submissionId);
    try {
      const res = await fetch(
        `/api/assessment/submissions/${submissionId}/manual`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId, correct }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      // Update local queue so the row reflects the new score immediately.
      setQueue((prev) => {
        if (!prev) return prev;
        const maxScore = prev.items[activeIdx].questionMaxScore;
        const nextItems = prev.items.map((it) => {
          if (it.questionId !== questionId) return it;
          return {
            ...it,
            entries: it.entries.map((ent) =>
              ent.submissionId === submissionId
                ? { ...ent, manualScore: correct ? maxScore : 0 }
                : ent
            ),
          };
        });
        return { items: nextItems };
      });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "grade_failed");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <>
        <div className="modal-backdrop" onClick={onClose} />
        <div className="quiz-modal" role="dialog" aria-modal="true">
          <div className="quiz-modal-header">
            <h2 className="quiz-modal-title">수동채점</h2>
            <button type="button" className="quiz-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="quiz-modal-body">⚠ 불러오지 못했어요: {error}</div>
        </div>
      </>
    );
  }

  if (!queue) {
    return (
      <>
        <div className="modal-backdrop" onClick={onClose} />
        <div className="quiz-modal" role="dialog" aria-modal="true">
          <div className="quiz-modal-body">불러오는 중...</div>
        </div>
      </>
    );
  }

  if (queue.items.length === 0) {
    return (
      <>
        <div className="modal-backdrop" onClick={onClose} />
        <div className="quiz-modal" role="dialog" aria-modal="true">
          <div className="quiz-modal-header">
            <h2 className="quiz-modal-title">수동채점</h2>
            <button type="button" className="quiz-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="quiz-modal-body">수동채점 문항이 없습니다.</div>
        </div>
      </>
    );
  }

  const active = queue.items[activeIdx];
  const graded = active.entries.filter((e) => e.manualScore !== null).length;
  const total = active.entries.length;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="quiz-modal manual-grade-modal"
        role="dialog"
        aria-modal="true"
        aria-label="수동채점"
      >
        <div className="quiz-modal-header">
          <h2 className="quiz-modal-title">
            수동채점 - {active.questionOrder + 1}번
          </h2>
          <button
            type="button"
            className="quiz-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="quiz-modal-body">
          <div className="manual-grade-progress">
            배점 {active.questionMaxScore}점 · {graded}/{total} 채점됨
          </div>
          {total === 0 ? (
            <div className="manual-grade-empty">
              아직 제출한 학생이 없습니다.
            </div>
          ) : (
            <ul className="manual-grade-list">
              {active.entries.map((ent) => {
                const verdict =
                  ent.manualScore === null
                    ? null
                    : ent.manualScore === active.questionMaxScore
                      ? "correct"
                      : "wrong";
                const highlightStart =
                  startSubmissionId === ent.submissionId ? " is-highlight" : "";
                return (
                  <li
                    key={ent.submissionId}
                    className={`manual-grade-row${highlightStart}`}
                  >
                    <div className="manual-grade-student">
                      {ent.studentNumber != null ? `${ent.studentNumber}. ` : ""}
                      {ent.studentName}
                    </div>
                    <pre className="manual-grade-answer">
                      {ent.textAnswer || "(답 없음)"}
                    </pre>
                    <div className="manual-grade-actions">
                      {verdict && (
                        <span
                          className={`assessment-badge${verdict === "correct" ? " assessment-badge-success" : ""}`}
                        >
                          {verdict === "correct" ? "정답" : "오답"}
                        </span>
                      )}
                      <button
                        type="button"
                        className="assessment-btn assessment-btn-ghost"
                        disabled={busy === ent.submissionId}
                        onClick={() =>
                          grade(ent.submissionId, active.questionId, false)
                        }
                      >
                        ✕ 오답
                      </button>
                      <button
                        type="button"
                        className="assessment-btn assessment-btn-primary"
                        disabled={busy === ent.submissionId}
                        onClick={() =>
                          grade(ent.submissionId, active.questionId, true)
                        }
                      >
                        ✓ 정답
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="manual-grade-nav">
          <button
            type="button"
            className="assessment-btn assessment-btn-ghost"
            onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
            disabled={activeIdx === 0}
          >
            ← 이전 문항
          </button>
          <span className="manual-grade-nav-pos">
            {activeIdx + 1}/{queue.items.length}
          </span>
          <button
            type="button"
            className="assessment-btn assessment-btn-ghost"
            onClick={() =>
              setActiveIdx((i) => Math.min(queue.items.length - 1, i + 1))
            }
            disabled={activeIdx === queue.items.length - 1}
          >
            다음 문항 →
          </button>
          <button
            type="button"
            className="assessment-btn assessment-btn-primary"
            onClick={onClose}
          >
            완료
          </button>
        </div>
      </div>
    </>
  );
}
