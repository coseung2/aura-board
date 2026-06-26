"use client";

// Teacher-only gradebook matrix for a single AssessmentTemplate.
// - student × question cells (correct/wrong/empty)
// - per-row 확정 button (finalize)
// - top-right 릴리스 (release everything that's finalized)

import { useCallback, useEffect, useState } from "react";
import type { AssessmentGradebookPayload } from "@/types/assessment";
import { AssessmentManualGradeModal } from "./AssessmentManualGradeModal";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: AssessmentGradebookPayload };

export interface AssessmentGradebookProps {
  templateId: string;
}

export function AssessmentGradebook({ templateId }: AssessmentGradebookProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [busySubmissionId, setBusySubmissionId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [manualOpen, setManualOpen] = useState<
    null | { questionId?: string; submissionId?: string }
  >(null);

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/assessment/templates/${templateId}/gradebook`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AssessmentGradebookPayload;
      setState({ kind: "ready", data });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "load_failed",
      });
    }
  }, [templateId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function finalize(submissionId: string) {
    setBusySubmissionId(submissionId);
    try {
      const res = await fetch(
        `/api/assessment/submissions/${submissionId}/finalize`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "finalize_failed");
    } finally {
      setBusySubmissionId(null);
    }
  }

  async function releaseAll() {
    if (state.kind !== "ready") return;
    const targets = state.data.rows
      .filter((r) => r.entry && !r.entry.releasedAt)
      .map((r) => r.submission?.id)
      .filter((x): x is string => !!x);
    if (targets.length === 0) {
      alert("먼저 각 학생의 '확정' 을 눌러주세요");
      return;
    }
    if (!confirm(`학급 ${targets.length}명에게 점수를 공개할까요?`)) return;
    setReleasing(true);
    try {
      for (const id of targets) {
        await fetch(`/api/assessment/submissions/${id}/release`, {
          method: "POST",
        });
      }
      await reload();
    } finally {
      setReleasing(false);
    }
  }

  if (state.kind === "loading") {
    return <div className="assessment-gradebook-loading">불러오는 중...</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="assessment-gradebook-error" role="alert">
        ⚠ 성적부를 불러오지 못했어요
      </div>
    );
  }
  const { data } = state;
  const submitted = data.rows.filter((r) => r.submission?.status === "submitted").length;
  const withEntries = data.rows.filter((r) => r.entry);
  const releasedCount = data.rows.filter((r) => r.entry?.releasedAt).length;
  const pendingManualTotal = data.rows.reduce(
    (acc, r) => acc + (r.pendingManualCount ?? 0),
    0
  );
  const studentsWithManual = data.rows.filter(
    (r) => (r.pendingManualCount ?? 0) > 0
  ).length;

  return (
    <div className="assessment-gradebook">
      <div className="assessment-gradebook-head">
        <h2 className="assessment-gradebook-title">{data.template.title} - 성적부</h2>
        <div className="assessment-gradebook-meta">
          제출 {submitted}/{data.rows.length}명 · 확정 {withEntries.length}명 · 공개 {releasedCount}명
        </div>
        <button
          type="button"
          className="assessment-btn assessment-btn-primary"
          onClick={releaseAll}
          disabled={releasing || withEntries.length === releasedCount}
        >
          {releasing ? "공개 중..." : "전체 릴리스"}
        </button>
      </div>

      {pendingManualTotal > 0 && (
        <div className="assessment-gradebook-manual-banner">
          <span>
            ⚠ 수동채점 대기 {pendingManualTotal}건
            <span className="assessment-gradebook-manual-hint">
              {" "}(학생 {studentsWithManual}명)
            </span>
          </span>
          <button
            type="button"
            className="assessment-btn assessment-btn-primary"
            onClick={() => setManualOpen({})}
          >
            채점 시작 →
          </button>
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="assessment-gradebook-empty">학급에 학생이 없습니다</div>
      ) : (
        <div className="assessment-gradebook-matrix-wrap">
          <table className="assessment-gradebook-matrix">
            <thead>
              <tr>
                <th className="assessment-gradebook-name">이름</th>
                {data.template.questions.map((q, i) => (
                  <th key={q.id}>{i + 1}</th>
                ))}
                <th>점수</th>
                <th>확정</th>
                <th>공개</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.student.id}>
                  <th className="assessment-gradebook-name" scope="row">
                    {r.student.number ? `${r.student.number}. ` : ""}
                    {r.student.name}
                  </th>
                  {data.template.questions.map((q) => {
                    const a = r.answers.find((x) => x.questionId === q.id);
                    if (a?.needsManual) {
                      return (
                        <td
                          key={q.id}
                          className="assessment-gradebook-cell assessment-gradebook-cell-pending"
                        >
                          <button
                            type="button"
                            className="assessment-gradebook-pending-btn"
                            onClick={() =>
                              setManualOpen({
                                questionId: q.id,
                                submissionId: r.submission!.id,
                              })
                            }
                            aria-label={`${r.student.name} ${q.order + 1}번 수동채점`}
                          >
                            ?
                          </button>
                        </td>
                      );
                    }
                    const cellState =
                      a?.correct === true
                        ? "correct"
                        : a?.correct === false
                          ? "wrong"
                          : "empty";
                    return (
                      <td
                        key={q.id}
                        className={`assessment-gradebook-cell assessment-gradebook-cell-${cellState}`}
                      >
                        {cellState === "correct" ? "○" : cellState === "wrong" ? "✕" : "·"}
                      </td>
                    );
                  })}
                  <td>
                    {r.submission?.status === "submitted"
                      ? `${r.totalAutoScore}/${data.maxScoreTotal}`
                      : "-"}
                  </td>
                  <td>
                    {r.submission?.status === "submitted" ? (
                      r.entry ? (
                        <span className="assessment-badge">확정됨</span>
                      ) : (r.pendingManualCount ?? 0) > 0 ? (
                        <button
                          type="button"
                          className="assessment-btn assessment-btn-ghost"
                          disabled
                          title={`수동채점 ${r.pendingManualCount}건 필요`}
                        >
                          채점 필요
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="assessment-btn assessment-btn-ghost"
                          disabled={busySubmissionId === r.submission.id}
                          onClick={() => finalize(r.submission!.id)}
                        >
                          확정
                        </button>
                      )
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {r.entry?.releasedAt ? (
                      <span className="assessment-badge assessment-badge-success">
                        공개됨
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manualOpen && (
        <AssessmentManualGradeModal
          templateId={templateId}
          startQuestionId={manualOpen.questionId}
          startSubmissionId={manualOpen.submissionId}
          onClose={() => {
            setManualOpen(null);
            reload();
          }}
          onChanged={() => {/* refetch deferred to close */}}
        />
      )}
    </div>
  );
}
