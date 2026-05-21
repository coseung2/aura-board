"use client";

import { useState, useRef } from "react";
import type { CardData } from "./DraggableCard";
import { OptimizedImage } from "./ui/OptimizedImage";
import { uploadFile } from "@/lib/upload-client";

const COLOR_PRESETS = [
  null, "#ffd8f4", "#c3faf5", "#ffe6cd", "#fde0f0",
  "#f2f9ff", "#ffc6c6", "#f6f5f4", "#e8f5e9", "#fff3e0",
];

type Props = {
  card: CardData;
  onSave: (updates: Partial<CardData>) => Promise<void>;
  onClose: () => void;
};

export function EditCardModal({ card, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [imageUrl, setImageUrl] = useState(card.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(card.linkUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(card.videoUrl ?? "");
  const [color, setColor] = useState<string | null>(card.color);
  const [showImage, setShowImage] = useState(!!card.imageUrl);
  const [showLink, setShowLink] = useState(!!card.linkUrl);
  const [showVideo, setShowVideo] = useState(!!card.videoUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(file: File, type: "image" | "video") {
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      if (type === "image") setImageUrl(url);
      else setVideoUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "업로드 실패";
      console.error(err);
      alert(`업로드 실패: ${msg}`);
    }
    setUploading(false);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal">
        <div className="modal-header">
          <h2 className="modal-title">카드 수정</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>

        <form
          className="modal-body"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            setBusy(true);
            await onSave({
              title: title.trim(),
              content: content.trim(),
              imageUrl: imageUrl || null,
              linkUrl: linkUrl || null,
              videoUrl: videoUrl || null,
              color,
            });
            setBusy(false);
            onClose();
          }}
        >
          <label className="modal-field-label">제목</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="카드 제목"
            className="modal-input"
            maxLength={200}
            required
          />

          <label className="modal-field-label">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용"
            rows={4}
            className="modal-textarea"
            maxLength={5000}
          />

          <div className="modal-attach-bar">
            <button
              type="button"
              className={`modal-attach-btn ${showImage ? "modal-attach-btn-active" : ""}`}
              onClick={() => setShowImage(!showImage)}
            >
              🖼️ 이미지
            </button>
            <button
              type="button"
              className={`modal-attach-btn ${showLink ? "modal-attach-btn-active" : ""}`}
              onClick={() => setShowLink(!showLink)}
            >
              🔗 링크
            </button>
            <button
              type="button"
              className={`modal-attach-btn ${showVideo ? "modal-attach-btn-active" : ""}`}
              onClick={() => setShowVideo(!showVideo)}
            >
              🎬 동영상
            </button>
          </div>

          {showImage && (
            <div className="modal-attach-section">
              {imageUrl ? (
                <div className="modal-file-preview optimized-img-wrap">
                  <div className="modal-preview-img-clickable-wrap" onClick={() => imageInputRef.current?.click()}>
                    <OptimizedImage
                      src={imageUrl}
                      alt=""
                      className="modal-preview-img"
                      sizes="320px"
                      fit="contain"
                    />
                  </div>
                  <div className="modal-file-preview-actions">
                    <button type="button" className="modal-file-replace" onClick={() => imageInputRef.current?.click()}>교체</button>
                    <button type="button" className="modal-file-remove" onClick={() => setImageUrl("")}>제거</button>
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "image");
                    }}
                  />
                </div>
              ) : (
                <div
                  className="modal-file-drop"
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    const f = e.dataTransfer.files[0];
                    if (f && f.type.startsWith("image/")) handleFileUpload(f, "image");
                  }}
                >
                  <span className="modal-file-drop-icon">🖼️</span>
                  <span>{uploading ? "업로드 중..." : "클릭 또는 이미지를 드래그하세요"}</span>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "image");
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {showLink && (
            <div className="modal-attach-section">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="modal-input"
                type="url"
              />
            </div>
          )}

          {showVideo && (
            <div className="modal-attach-section">
              {videoUrl ? (
                <div className="modal-file-preview">
                  <video src={videoUrl} className="modal-preview-video-file" controls />
                  <button type="button" className="modal-file-remove" onClick={() => setVideoUrl("")}>제거</button>
                </div>
              ) : (
                <div
                  className="modal-file-drop"
                  onClick={() => videoInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    const f = e.dataTransfer.files[0];
                    if (f && f.type.startsWith("video/")) handleFileUpload(f, "video");
                  }}
                >
                  <span className="modal-file-drop-icon">🎬</span>
                  <span>{uploading ? "업로드 중..." : "클릭 또는 동영상을 드래그하세요"}</span>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "video");
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="modal-color-section">
            <span className="modal-color-label">카드 색상</span>
            <div className="modal-color-row">
              {COLOR_PRESETS.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`modal-color-btn ${color === c ? "modal-color-btn-active" : ""}`}
                  style={{ background: c ?? "#ffffff" }}
                  onClick={() => setColor(c)}
                  aria-label={c ?? "기본"}
                >
                  {color === c && "✓"}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy} className="modal-btn-cancel">취소</button>
            <button type="submit" disabled={busy || !title.trim()} className="modal-btn-submit">
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
