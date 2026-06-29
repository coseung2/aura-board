"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  STREAM_ACTIVITY_TEMPLATE_LABELS,
  STREAM_ACTIVITY_TEMPLATES,
  type StreamActivityTemplate,
} from "@/lib/stream-activity-templates";
import type { StreamSection } from "./stream-board-model";

export function ActivityTemplateModal({
  section,
  busy,
  onClose,
  onApply,
}: {
  section: StreamSection;
  busy: boolean;
  onClose: () => void;
  onApply: (template: StreamActivityTemplate | null) => Promise<void>;
}) {
  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
      <div
        className="add-card-modal stream-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-template-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="stream-template-modal-title">
            활동 템플릿
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="stream-template-modal-section">{section.title}</p>
          <div className="stream-template-grid">
            {STREAM_ACTIVITY_TEMPLATES.map((template) => {
              const selected = section.activityTemplate === template;
              return (
                <button
                  key={template}
                  type="button"
                  className={`stream-template-card${selected ? " is-selected" : ""}`}
                  onClick={() => onApply(template)}
                  disabled={busy}
                  aria-pressed={selected}
                >
                  <StreamTemplatePreviewSvg template={template} />
                  <span className="stream-template-card-title">
                    {STREAM_ACTIVITY_TEMPLATE_LABELS[template]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="stream-template-modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={() => onApply(null)}
              disabled={busy || !section.activityTemplate}
            >
              템플릿 해제
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function SectionWritingPromptModal({
  section,
  initialTitlePrompt,
  initialContentPrompt,
  busy,
  onClose,
  onSave,
}: {
  section: StreamSection;
  initialTitlePrompt: string;
  initialContentPrompt: string;
  busy: boolean;
  onClose: () => void;
  onSave: (prompts: { titlePrompt: string; contentPrompt: string }) => Promise<void>;
}) {
  const [titlePrompt, setTitlePrompt] = useState(initialTitlePrompt);
  const [contentPrompt, setContentPrompt] = useState(initialContentPrompt);

  useEffect(() => {
    setTitlePrompt(initialTitlePrompt);
    setContentPrompt(initialContentPrompt);
  }, [initialTitlePrompt, initialContentPrompt, section.id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave({ titlePrompt, contentPrompt });
  }

  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
      <div
        className="add-card-modal stream-template-modal stream-section-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-section-prompt-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="stream-section-prompt-modal-title">
            글쓰기 안내
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <form className="modal-body stream-section-prompt-form" onSubmit={handleSubmit}>
          <p className="stream-template-modal-section">{section.title}</p>
          <label className="stream-section-prompt-field">
            <span>제목 안내</span>
            <input
              type="text"
              value={titlePrompt}
              onChange={(event) => setTitlePrompt(event.target.value)}
              placeholder="제목 입력칸에 보여줄 문구"
              maxLength={120}
              disabled={busy}
            />
          </label>
          <label className="stream-section-prompt-field">
            <span>본문 안내</span>
            <textarea
              value={contentPrompt}
              onChange={(event) => setContentPrompt(event.target.value)}
              placeholder="본문 입력칸에 보여줄 문구"
              maxLength={300}
              rows={4}
              disabled={busy}
            />
          </label>
          <div className="stream-template-modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
              disabled={busy}
            >
              취소
            </button>
            <button type="submit" className="modal-btn-submit" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function StreamTemplatePreviewSvg({
  template,
}: {
  template: StreamActivityTemplate;
}) {
  if (template === "window_opening") {
    return (
      <svg
        className="stream-template-card-preview"
        viewBox="0 0 160 96"
        role="img"
        aria-label="창문 열기 예시"
      >
        <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
        <g className="stream-template-preview-line">
          <rect x="18" y="16" width="124" height="64" rx="4" />
          <path d="M18 37.33h124M18 58.67h124M59.33 16v64M100.67 16v64" />
        </g>
        <rect className="stream-template-preview-accent-fill" x="59.33" y="37.33" width="41.34" height="21.34" />
      </svg>
    );
  }

  if (template === "word_cloud") {
    return (
      <svg
        className="stream-template-card-preview"
        viewBox="0 0 160 96"
        role="img"
        aria-label="워드클라우드 예시"
      >
        <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
        <g className="stream-template-preview-word">
          <text x="48" y="44">생각</text>
          <text x="83" y="61">질문</text>
          <text x="25" y="64">근거</text>
          <text x="93" y="33">탐구</text>
          <text x="61" y="76">정리</text>
        </g>
        <circle className="stream-template-preview-dot" cx="40" cy="28" r="4" />
        <circle className="stream-template-preview-dot" cx="120" cy="70" r="3" />
      </svg>
    );
  }

  if (template === "map") {
    return (
      <svg
        className="stream-template-card-preview"
        viewBox="0 0 160 96"
        role="img"
        aria-label="지도 예시"
      >
        <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
        <path className="stream-template-preview-map-land" d="M18 70 45 18l34 18 29-15 34 50Z" />
        <path className="stream-template-preview-line" d="M43 62c24-28 42-29 74-8" />
        <g className="stream-template-preview-pin">
          <path d="M42 48c0 10-10 20-10 20s-10-10-10-20a10 10 0 1 1 20 0Z" />
          <circle cx="32" cy="48" r="3" />
          <path d="M128 42c0 10-10 20-10 20s-10-10-10-20a10 10 0 1 1 20 0Z" />
          <circle cx="118" cy="42" r="3" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className="stream-template-card-preview"
      viewBox="0 0 160 96"
      role="img"
      aria-label="연표 예시"
    >
      <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
      <path className="stream-template-preview-line" d="M32 50h96" />
      <g className="stream-template-preview-timeline">
        <circle cx="40" cy="50" r="6" />
        <circle cx="80" cy="50" r="6" />
        <circle cx="120" cy="50" r="6" />
        <path d="M32 26h32M71 70h34M112 26h30" />
      </g>
    </svg>
  );
}
