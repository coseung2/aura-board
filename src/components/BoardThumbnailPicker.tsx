"use client";

import { useState, useRef } from "react";
import { layoutThumbnail } from "@/lib/layout-meta";
import { uploadFile } from "@/lib/upload-client";

export type ThumbnailMode = "default" | "custom";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

type Props = {
  layout: string;
  mode: ThumbnailMode;
  url: string | null;
  onChange: (next: { mode: ThumbnailMode; url: string | null }) => void;
  disabled?: boolean;
};

export function BoardThumbnailPicker({
  layout,
  url,
  onChange,
  disabled,
}: Props) {
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewSrc = url ?? layoutThumbnail(layout) ?? FALLBACK_THUMBNAIL;
  const busy = disabled || uploadBusy;

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
      <div className="board-thumbnail-preview board-thumbnail-preview--upload">
        <img src={previewSrc} alt="보드 썸네일 미리보기" />
        <div className="board-thumbnail-overlay">
          <p className="board-thumbnail-help">
            이미지를 올리지 않으면 기본 이미지로 적용됩니다.
          </p>
          <button
            type="button"
            className="board-thumbnail-upload-btn"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <span>{uploadBusy ? "업로드 중..." : "이미지 업로드"}</span>
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            if (inputRef.current) inputRef.current.value = "";
          }}
          disabled={busy}
          hidden
        />
      </div>

      {error && <p className="board-settings-error">{error}</p>}
    </div>
  );
}
