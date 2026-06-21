"use client";

import { useState, useRef } from "react";
import { layoutEmoji, layoutThumbnail } from "@/lib/layout-meta";
import { uploadFile } from "@/lib/upload-client";
import { SegmentedControl } from "./ui/SegmentedControl";

export type ThumbnailMode = "default" | "none" | "custom";

type Props = {
  layout: string;
  mode: ThumbnailMode;
  url: string | null;
  onChange: (next: { mode: ThumbnailMode; url: string | null }) => void;
  disabled?: boolean;
};

const MODE_OPTIONS: { value: ThumbnailMode; label: string }[] = [
  { value: "default", label: "기본 이미지" },
  { value: "custom", label: "직접 업로드" },
  { value: "none", label: "아이콘" },
];

export function BoardThumbnailPicker({
  layout,
  mode,
  url,
  onChange,
  disabled,
}: Props) {
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewSrc =
    mode === "custom" && url ? url : mode === "none" ? null : layoutThumbnail(layout);
  const previewEmoji = layoutEmoji(layout);

  async function handleFile(file: File) {
    setUploadBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      onChange({ mode: "custom", url: uploaded.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="board-thumbnail-picker">
      <div className="board-thumbnail-preview">
        {previewSrc ? (
          <img src={previewSrc} alt="보드 썸네일 미리보기" />
        ) : (
          <span aria-hidden="true">{previewEmoji}</span>
        )}
      </div>

      <SegmentedControl
        value={mode}
        onChange={(next) => onChange({ mode: next, url })}
        options={MODE_OPTIONS}
        ariaLabel="썸네일 표시 방식"
        disabled={disabled || uploadBusy}
      />

      {mode === "custom" && (
        <div className="board-thumbnail-upload">
          {url ? (
            <div className="board-thumbnail-uploaded">
              <img src={url} alt="업로드된 썸네일" />
              <button
                type="button"
                className="board-thumbnail-remove"
                onClick={() => onChange({ mode: "custom", url: null })}
                disabled={disabled || uploadBusy}
              >
                제거
              </button>
            </div>
          ) : (
            <label className={`modal-file-drop${uploadBusy ? " is-disabled" : ""}`}>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={disabled || uploadBusy}
                hidden
              />
              <span className="modal-file-drop-icon" aria-hidden="true">
                {uploadBusy ? "⏳" : "📎"}
              </span>
              <span>
                {uploadBusy ? "업로드 중..." : "이미지를 선택하세요"}
              </span>
            </label>
          )}
        </div>
      )}

      {error && <p className="board-settings-error">{error}</p>}
    </div>
  );
}
