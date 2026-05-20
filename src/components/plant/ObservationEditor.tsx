"use client";

import { useEffect, useRef, useState } from "react";
import type { ObservationDTO } from "@/types/plant";
import { uploadFile } from "@/lib/upload-client";
import { OptimizedImage } from "../ui/OptimizedImage";

interface Image {
  url: string;
  thumbnailUrl?: string | null;
}

interface Props {
  open: boolean;
  title?: string;
  initial?: ObservationDTO | null;
  onCancel: () => void;
  onSubmit: (payload: { memo: string; images: Image[] }) => Promise<void>;
}

const MAX_IMAGES = 10;
const MAX_MEMO = 500;

export function ObservationEditor({ open, title, initial, onCancel, onSubmit }: Props) {
  const [memo, setMemo] = useState("");
  const [images, setImages] = useState<Image[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMemo(initial?.memo ?? "");
    setImages((initial?.images ?? []).map((image) => ({
      url: image.url,
      thumbnailUrl: image.thumbnailUrl,
    })));
    setError(null);
    setSaving(false);
    setUploading(false);
    setPreviewUrl(null);
  }, [initial, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewUrl) {
        setPreviewUrl(null);
        return;
      }
      if (!saving && !uploading) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, open, previewUrl, saving, uploading]);

  if (!open) return null;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;

    setUploading(true);
    setError(null);
    try {
      const uploaded: Image[] = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        const result = await uploadFile(file);
        uploaded.push({ url: result.url });
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "사진을 업로드하지 못했어요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit() {
    if (saving || uploading) return;
    if (memo.trim().length === 0 && images.length === 0) {
      setError("사진이나 메모 중 하나는 필요해요.");
      return;
    }
    if (memo.length > MAX_MEMO) {
      setError(`메모는 ${MAX_MEMO}자 이내로 적어 주세요.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({ memo, images });
    } catch (err) {
      setError(err instanceof Error ? err.message : "관찰 기록을 저장하지 못했어요.");
      setSaving(false);
    }
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <>
      <div className="plant-modal-backdrop" role="dialog" aria-modal="true" aria-label="관찰 기록">
        <div className="plant-modal plant-observation-editor">
          <h3>{title ?? "관찰 기록"}</h3>
          <div className="plant-modal-row">
            <label
              htmlFor="plant-file-upload"
              className="plant-upload-drop"
              style={full ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              {full
                ? `최대 ${MAX_IMAGES}장까지 올릴 수 있어요.`
                : "사진을 올려주세요. (클릭하거나 끌어 놓기)"}
            </label>
            <input
              id="plant-file-upload"
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => handleFiles(event.target.files)}
              disabled={full || uploading || saving}
            />
            {images.length > 0 && (
              <div className="plant-thumb-grid">
                {images.map((image, index) => (
                  <div
                    key={`${image.url}-${index}`}
                    className="plant-thumb optimized-img-wrap"
                    onClick={() => setPreviewUrl(image.url)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setPreviewUrl(image.url);
                      }
                    }}
                  >
                    <OptimizedImage
                      src={image.thumbnailUrl ?? image.url}
                      alt={`사진 ${index + 1}`}
                      sizes="96px"
                    />
                    <button
                      type="button"
                      aria-label={`사진 ${index + 1} 삭제`}
                      className="plant-thumb-x"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeImage(index);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploading && (
              <div className="plant-upload-progress" aria-label="업로드 중" aria-live="polite" />
            )}
          </div>
          <div className="plant-modal-row">
            <label htmlFor="plant-memo">메모</label>
            <textarea
              id="plant-memo"
              value={memo}
              maxLength={MAX_MEMO}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="어떤 모습이었나요?"
            />
            <div className="plant-memo-count">
              {memo.length} / {MAX_MEMO}
            </div>
          </div>
          {error && <p className="plant-error">{error}</p>}
          <div className="plant-modal-actions">
            <button type="button" onClick={onCancel} disabled={saving || uploading}>
              취소
            </button>
            <button type="button" className="primary" onClick={submit} disabled={saving || uploading}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>

      {previewUrl && (
        <div
          className="plant-lightbox"
          role="dialog"
          aria-label="사진 원본"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="plant-lightbox-frame optimized-img-wrap">
            <OptimizedImage
              src={previewUrl}
              alt="관찰 사진 원본"
              sizes="90vw"
              priority
              fit="contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
