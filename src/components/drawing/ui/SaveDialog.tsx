"use client";

import { useState } from "react";

export function SaveDialog({
  busy,
  error,
  mode = "library",
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  /** "library" = 학생 → /api/student-assets 업로드. "download" = 교사 등 → 로컬 PNG 저장. */
  mode?: "library" | "download";
  onCancel: () => void;
  onSubmit: (opts: { title: string; shared: boolean }) => void;
}) {
  const [title, setTitle] = useState("");
  const [shared, setShared] = useState(false);

  return (
    <div
      className="ds-save-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="그림 저장"
    >
      <div className="ds-save-dialog">
        <h3>{mode === "library" ? "그림 저장" : "그림 내려받기"}</h3>
        {mode === "download" && (
          <p
            className="ds-field-label"
            style={{ color: "var(--color-text-muted)" }}
          >
            교사 계정은 라이브러리 대신 PNG 파일로 내려받아요.
          </p>
        )}
        <label className="ds-field-label">
          제목
          <input
            type="text"
            className="ds-text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="내 그림"
            maxLength={120}
          />
        </label>
        {mode === "library" && (
          <label className="ds-checkbox-label">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />
            반 갤러리에 공유
          </label>
        )}

        {error && <div className="ds-save-error">{error}</div>}

        <div className="ds-save-actions">
          <button
            type="button"
            className="ds-btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className="ds-btn-primary"
            onClick={() => onSubmit({ title: title.trim() || "내 그림", shared })}
            disabled={busy}
          >
            {busy
              ? "저장 중…"
              : mode === "library"
                ? "저장"
                : "PNG 내려받기"}
          </button>
        </div>
      </div>
    </div>
  );
}
