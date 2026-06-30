"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BarChartViz } from "./question/viz/BarChartViz";
import { PieChartViz } from "./question/viz/PieChartViz";
import { TimelineViz } from "./question/viz/TimelineViz";
import { ResponseListViz } from "./question/viz/ResponseListViz";
import { useBoardSnapshotRealtime } from "@/hooks/useBoardSnapshotRealtime";

// d3-cloud 는 브라우저 전용 canvas 측정 사용 → SSR 에서 import 안 됨.
const WordCloudViz = dynamic(
  () => import("./question/viz/WordCloudViz").then((m) => m.WordCloudViz),
  { ssr: false, loading: () => <div className="qb-viz-loading">로딩…</div> },
);

export type VizMode = "word-cloud" | "bar" | "pie" | "timeline" | "list";

export type QuestionResponse = {
  id: string;
  text: string;
  createdAt: string;
  studentId: string | null;
  userId: string | null;
  authorName: string;
};

type Props = {
  boardId: string;
  boardSlug: string;
  initialPrompt: string | null;
  initialVizMode: VizMode;
  viewerKind: "teacher" | "student" | "none";
  currentStudentId: string | null;
};

const VIZ_LABELS: Record<VizMode, { emoji: string; label: string }> = {
  "word-cloud": { emoji: "☁️", label: "워드클라우드" },
  bar: { emoji: "📊", label: "막대 차트" },
  pie: { emoji: "🥧", label: "파이 차트" },
  timeline: { emoji: "🕒", label: "타임라인" },
  list: { emoji: "📃", label: "리스트" },
};

export function QuestionBoard({
  boardId,
  boardSlug: _boardSlug,
  initialPrompt,
  initialVizMode,
  viewerKind,
  currentStudentId: _currentStudentId,
}: Props) {
  const [prompt, setPrompt] = useState<string | null>(initialPrompt);
  const [vizMode, setVizMode] = useState<VizMode>(initialVizMode);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [promptDraft, setPromptDraft] = useState(initialPrompt ?? "");
  const [promptEditing, setPromptEditing] = useState(false);

  const canEdit = viewerKind === "teacher";

  // 초기 응답 fetch — 이후엔 SSE 가 업데이트를 공급.
  useEffect(() => {
    let alive = true;
    fetch(`/api/boards/${boardId}/responses`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.responses) setResponses(data.responses);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [boardId]);

  // Realtime: refetch /snapshot on mount and whenever the backend broadcasts
  // `question_changed` on channel `board:{boardId}`. Replaces the old 15s poll.
  const applyQuestionSnapshot = useCallback(
    (data: { [key: string]: unknown }) => {
      const q = (
        data as {
          question?: {
            prompt: string | null;
            vizMode: VizMode;
            responses: QuestionResponse[];
          } | null;
        }
      ).question;
      if (!q) return;
      setPrompt(q.prompt);
      setVizMode(q.vizMode);
      setResponses(q.responses);
    },
    [],
  );

  useBoardSnapshotRealtime(
    boardId,
    ["question_changed"],
    applyQuestionSnapshot,
  );

  const submitResponse = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setDraft("");
      } else {
        alert("응답 전송 실패");
      }
    } finally {
      setSubmitting(false);
    }
  }, [boardId, draft, submitting]);

  const savePrompt = useCallback(async () => {
    if (!canEdit) return;
    const next = promptDraft.trim() || null;
    const res = await fetch(`/api/boards/${boardId}/question-config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: next }),
    });
    if (res.ok) {
      setPrompt(next);
      setPromptEditing(false);
    } else {
      alert("주제 저장 실패");
    }
  }, [boardId, canEdit, promptDraft]);

  const changeViz = useCallback(
    async (mode: VizMode) => {
      if (!canEdit) return;
      setVizMode(mode); // optimistic
      const res = await fetch(`/api/boards/${boardId}/question-config`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vizMode: mode }),
      });
      if (!res.ok) alert("모드 전환 실패");
    },
    [boardId, canEdit],
  );

  const deleteResponse = useCallback(
    async (responseId: string) => {
      if (!canEdit) return;
      if (!window.confirm("이 응답을 삭제할까요?")) return;
      const res = await fetch(
        `/api/boards/${boardId}/responses/${responseId}`,
        { method: "DELETE" },
      );
      if (!res.ok) alert("삭제 실패");
    },
    [boardId, canEdit],
  );

  const vizContent = useMemo(() => {
    if (responses.length === 0) {
      return <p className="qb-empty">아직 응답이 없어요.</p>;
    }
    switch (vizMode) {
      case "word-cloud":
        return <WordCloudViz responses={responses} />;
      case "bar":
        return <BarChartViz responses={responses} />;
      case "pie":
        return <PieChartViz responses={responses} />;
      case "timeline":
        return (
          <TimelineViz responses={responses} onDelete={canEdit ? deleteResponse : undefined} />
        );
      case "list":
        return (
          <ResponseListViz
            responses={responses}
            onDelete={canEdit ? deleteResponse : undefined}
          />
        );
    }
  }, [responses, vizMode, canEdit, deleteResponse]);

  return (
    <section className="question-board">
      <header className="qb-header">
        <div className="qb-prompt-row">
          {promptEditing && canEdit ? (
            <>
              <input
                className="qb-prompt-input"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="주제를 입력하세요 (예: 오늘 배운 내용 중 가장 기억에 남는 것은?)"
                maxLength={500}
                autoFocus
              />
              <button type="button" className="qb-btn" onClick={savePrompt}>
                저장
              </button>
              <button
                type="button"
                className="qb-btn qb-btn-ghost"
                onClick={() => {
                  setPromptDraft(prompt ?? "");
                  setPromptEditing(false);
                }}
              >
                취소
              </button>
            </>
          ) : (
            <>
              <h2 className="qb-prompt">{prompt || "주제가 아직 설정되지 않았어요."}</h2>
              {canEdit && (
                <button
                  type="button"
                  className="qb-btn qb-btn-ghost"
                  onClick={() => setPromptEditing(true)}
                >
                  {prompt ? "주제 수정" : "주제 설정"}
                </button>
              )}
            </>
          )}
        </div>

        {canEdit && (
          <div className="qb-viz-toggle" role="radiogroup" aria-label="시각화 모드">
            {(Object.keys(VIZ_LABELS) as VizMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`qb-viz-chip${vizMode === mode ? " is-active" : ""}`}
                role="radio"
                aria-checked={vizMode === mode}
                onClick={() => changeViz(mode)}
              >
                <span aria-hidden>{VIZ_LABELS[mode].emoji}</span>
                {VIZ_LABELS[mode].label}
              </button>
            ))}
          </div>
        )}
      </header>

      {viewerKind !== "none" && (
        <div className="qb-input-row">
          <textarea
            className="qb-input"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={prompt ? "자유롭게 응답을 남겨 주세요" : "교사가 주제를 설정하면 응답할 수 있어요"}
            maxLength={500}
            disabled={!prompt}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitResponse();
              }
            }}
          />
          <button
            type="button"
            className="qb-btn qb-btn-primary"
            onClick={submitResponse}
            disabled={!draft.trim() || submitting || !prompt}
          >
            {submitting ? "보내는 중…" : "보내기"}
          </button>
        </div>
      )}

      <div className="qb-viz-stage">{vizContent}</div>

      <footer className="qb-footer">
        <span className="qb-count">{responses.length}개 응답</span>
      </footer>
    </section>
  );
}
