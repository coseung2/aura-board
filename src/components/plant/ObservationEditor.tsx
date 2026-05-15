"use client";

import { useEffect, useRef, useState } from "react";
import type { ObservationDTO } from "@/types/plant";
import { OptimizedImage } from "../ui/OptimizedImage";
import { uploadFile } from "@/lib/upload-client";

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
    setImages(
      (initial?.images ?? []).map((i) => ({ url: i.url, thumbnailUrl: i.thumbnailUrl }))
    );
    setError(null);
    setSaving(false);
    setUploading(false);
    setPreviewUrl(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && previewUrl) {
        setPreviewUrl(null);
        return;
      }
      if (e.key === "Escape" && !saving && !uploading) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel, previewUrl, saving, uploading]);

  if (!open) return null;

  async function handleFiles(fs: FileList | null) {
    if (!fs || fs.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;
    const arr = Array.from(fs).slice(0, remaining);
    setUploading(true);
    setError(null);
    try {
      const uploaded: Image[] = [];
      for (const f of arr) {
        const res = await uploadFile(f);
        uploaded.push({ url: res.url });
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (saving || uploading) return;
    if (memo.length === 0 && images.length === 0) {
      setError("사진 또는 메모 중 하나는 필요해요.");
      return;
    }
    if (memo.length > MAX_MEMO) {
      setError(`메모는 ${MAX_MEMO}자 이내여야 해요.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ memo, images });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <>
    <div className="plant-modal-backdrop" role="dialog" aria-modal="true" aria-label="관찰 기록">
      <div className="plant-modal">
        <h3>{title ?? "관찰 기록"}</h3>
        <div className="plant-modal-row">
          <label
            htmlFor="plant-file-upload"
            className="plant-upload-drop"
            style={full ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            {full
              ? `최대 ${MAX_IMAGES}장까지 올릴 수 있어요`
              : "사진을 올려주세요 (탭 또는 끌어 놓기)"}
          </label>
          <input
            id="plant-file-upload"
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
            disabled={full || uploading || saving}
          />
          {images.length > 0 && (
            <div className="plant-thumb-grid">
              {images.map((img, i) => (
                <div
                  key={`${img.url}-${i}`}
                  className="plant-thumb optimized-img-wrap"
                  onClick={() => setPreviewUrl(img.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreviewUrl(img.url);
                    }
                  }}
                >
                  <OptimizedImage
                    src={img.thumbnailUrl ?? img.url}
                    alt={`사진 ${i + 1}`}
                    sizes="96px"
                  />
                  <button
                    type="button"
                    aria-label={`사진 ${i + 1} 삭제`}
                    className="plant-thumb-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(i);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploading && <div className="plant-upload-progress" aria-label="업로드 중" aria-live="polite" />}
        </div>
        <div className="plant-modal-row">
          <label htmlFor="plant-memo">메모</label>
          <textarea
            id="plant-memo"
            value={memo}
            maxLength={MAX_MEMO}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="어떤 모습이었나요?"
          />
          <div style={{ fontSize: 11, color: "var(--color-text-faint)", textAlign: "right" }}>
            {memo.length} / {MAX_MEMO}
          </div>
        </div>
        {error && <p className="plant-error">{error}</p>}
        <div className="plant-modal-actions">
          <button type="button" onClick={onCancel} disabled={saving || uploading}>취소</button>
          <button type="button" className="primary" onClick={submit} disabled={saving || uploading}>
            {saving ? "저장 중…" : "저장"}
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
