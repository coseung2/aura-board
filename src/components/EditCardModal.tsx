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
  // 이미지 URL은 card.imageUrl(레거시) 또는 attachments의 첫 번째 이미지에서 가져온다.
  const initialImageUrl = card.imageUrl ?? (card.attachments ?? []).find(a => a.kind === "image")?.url ?? "";
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [linkUrl, setLinkUrl] = useState(card.linkUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(card.videoUrl ?? "");
  const [color, setColor] = useState<string | null>(card.color);
  const [showImage, setShowImage] = useState(!!initialImageUrl);
  const [showLink, setShowLink] = useState(!!card.linkUrl);
  const [showVideo, setShowVideo] = useState(!!card.videoUrl);
  const [busy, setBusy] = useState(false);
  const [uploadingType, setUploadingType] = useState<"image" | "video" | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const uploadLockRef = useRef(false);
  const isUploading = uploadingType !== null;
  const isImageUploading = uploadingType === "image";
  const isVideoUploading = uploadingType === "video";

  function openImagePicker() {
    if (isUploading) return;
    imageInputRef.current?.click();
  }

  function openVideoPicker() {
    if (isUploading) return;
    videoInputRef.current?.click();
  }

  async function handleFileUpload(file: File, type: "image" | "video") {
    if (uploadLockRef.current) return;
    uploadLockRef.current = true;
    setUploadingType(type);
    try {
      const { url } = await uploadFile(file);
      if (type === "image") setImageUrl(url);
      else setVideoUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "업로드 실패";
      console.error(err);
      alert(`업로드 실패: ${msg}`);
    } finally {
      uploadLockRef.current = false;
      setUploadingType(null);
    }
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
            if (!title.trim() || isUploading) return;
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
                  <div
                    className={`modal-preview-img-clickable-wrap ${isImageUploading ? "is-uploading" : ""}`}
                    role="button"
                    tabIndex={isUploading ? -1 : 0}
                    aria-label="이미지 교체 파일 선택"
                    aria-disabled={isUploading}
                    aria-busy={isImageUploading}
                    onClick={openImagePicker}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openImagePicker();
                      }
                    }}
                  >
                    <OptimizedImage
                      src={imageUrl}
                      alt=""
                      className="modal-preview-img"
                      sizes="320px"
                      fit="contain"
                    />
                    {isImageUploading && <span className="modal-file-uploading-overlay">업로드 중...</span>}
                  </div>
                  <div className="modal-file-preview-actions">
                    <button type="button" className="modal-file-replace" onClick={openImagePicker} disabled={isUploading}>
                      {isImageUploading ? "업로드 중..." : "교체"}
                    </button>
                  </div>
                  <button type="button" className="modal-file-remove" onClick={() => setImageUrl("")} disabled={isUploading}>제거</button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={isUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "image");
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              ) : (
                <div
                  className={`modal-file-drop ${isUploading ? "is-disabled" : ""}`}
                  aria-disabled={isUploading}
                  aria-busy={isImageUploading}
                  onClick={openImagePicker}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    if (isUploading) return;
                    const f = e.dataTransfer.files[0];
                    if (f && f.type.startsWith("image/")) handleFileUpload(f, "image");
                  }}
                >
                  <span className="modal-file-drop-icon">🖼️</span>
                  <span>{isImageUploading ? "업로드 중..." : "클릭 또는 이미지를 드래그하세요"}</span>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={isUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "image");
                      e.currentTarget.value = "";
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
                  className={`modal-file-drop ${isUploading ? "is-disabled" : ""}`}
                  onClick={openVideoPicker}
                  aria-disabled={isUploading}
                  aria-busy={isVideoUploading}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    if (isUploading) return;
                    const f = e.dataTransfer.files[0];
                    if (f && f.type.startsWith("video/")) handleFileUpload(f, "video");
                  }}
                >
                  <span className="modal-file-drop-icon">🎬</span>
                  <span>{isVideoUploading ? "업로드 중..." : "클릭 또는 동영상을 드래그하세요"}</span>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    hidden
                    disabled={isUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f, "video");
                      e.currentTarget.value = "";
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
            <button type="submit" disabled={busy || isUploading || !title.trim()} className="modal-btn-submit">
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
