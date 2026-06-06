"use client";

import { useState, useRef } from "react";
import type { CardData } from "./DraggableCard";
import { uploadFile } from "@/lib/upload-client";
import { MAX_ATTACHMENTS_PER_CARD } from "@/lib/file-attachment";
import {
  useCardAttachments,
  type AttachmentDraft,
} from "./cards/useCardAttachments";
import { detectFirstUrl, removeUrlFromText } from "@/lib/link-detection";

const COLOR_PRESETS = [
  null, "#ffd8f4", "#c3faf5", "#ffe6cd", "#fde0f0",
  "#f2f9ff", "#ffc6c6", "#f6f5f4", "#e8f5e9", "#fff3e0",
];

const IMAGE_ACCEPT = "image/*";

type EditCardUpdates = Omit<Partial<CardData>, "attachments"> & {
  attachments?: AttachmentDraft[];
};

type Props = {
  card: CardData;
  onSave: (updates: EditCardUpdates) => Promise<void>;
  onClose: () => void;
};

function toInitialAttachments(card: CardData): AttachmentDraft[] {
  const normalized: AttachmentDraft[] = (card.attachments ?? [])
    .filter((a) => a.kind === "image" || a.kind === "video" || a.kind === "file")
    .sort((a, b) => a.order - b.order)
    .map((a) => ({
      tempId: a.id,
      kind: a.kind as AttachmentDraft["kind"],
      url: a.url,
      previewUrl: a.previewUrl ?? null,
      fileName: a.fileName ?? undefined,
      fileSize: a.fileSize ?? undefined,
      mimeType: a.mimeType ?? undefined,
    }));

  // 레거시 imageUrl만 있는 카드도 다중 첨부 편집 UI에서 그대로 보이게 한다.
  if (card.imageUrl && !normalized.some((a) => a.kind === "image" && a.url === card.imageUrl)) {
    normalized.unshift({
      tempId: `legacy-image-${card.id}`,
      kind: "image",
      url: card.imageUrl,
    });
  }

  return normalized;
}

export function EditCardModal({ card, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [linkUrl, setLinkUrl] = useState(card.linkUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(card.videoUrl ?? "");
  const [color, setColor] = useState<string | null>(card.color);
  const [showImage, setShowImage] = useState(
    Boolean(card.imageUrl) || (card.attachments ?? []).some((a) => a.kind === "image")
  );
  const [showLink, setShowLink] = useState(!!card.linkUrl);
  const [showVideo, setShowVideo] = useState(!!card.videoUrl);
  const [busy, setBusy] = useState(false);
  const [uploadingType, setUploadingType] = useState<"video" | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const uploadLockRef = useRef(false);

  const {
    attachments,
    uploading: attachmentsUploading,
    totalCount,
    canAddMore,
    countByKind,
    uploadMany,
    removeAttachment,
    moveAttachment,
    isFirstOfKind,
    isLastOfKind,
  } = useCardAttachments(toInitialAttachments(card));

  const isUploading = attachmentsUploading || uploadingType !== null;
  const isVideoUploading = uploadingType === "video";
  const detectedContentUrl = linkUrl ? null : detectFirstUrl(content);

  function promoteDetectedLink() {
    if (!detectedContentUrl) return;
    setLinkUrl(detectedContentUrl);
    setContent((text) => removeUrlFromText(text, detectedContentUrl));
    setShowLink(true);
  }

  function openVideoPicker() {
    if (isUploading) return;
    videoInputRef.current?.click();
  }

  async function handleVideoUpload(file: File) {
    if (uploadLockRef.current) return;
    uploadLockRef.current = true;
    setUploadingType("video");
    try {
      const { url } = await uploadFile(file);
      setVideoUrl(url);
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
            if (isUploading) return;
            if (attachments.length > MAX_ATTACHMENTS_PER_CARD) {
              alert(`첨부는 카드당 최대 ${MAX_ATTACHMENTS_PER_CARD}개까지 가능합니다.`);
              return;
            }
            setBusy(true);
            const payloadAttachments = attachments.map((a) => ({
              kind: a.kind,
              url: a.url,
              previewUrl: a.previewUrl ?? null,
              fileName: a.fileName,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
            })) as AttachmentDraft[];
            const firstImage = payloadAttachments.find((a) => a.kind === "image");
            const hasCardBody =
              title.trim().length > 0 ||
              content.trim().length > 0 ||
              Boolean(linkUrl) ||
              Boolean(videoUrl) ||
              payloadAttachments.length > 0;
            if (!hasCardBody) return;
            await onSave({
              title: title.trim(),
              content: content.trim(),
              imageUrl: firstImage?.url ?? null,
              attachments: payloadAttachments,
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
          {detectedContentUrl && (
            <button
              type="button"
              className="modal-link-promote"
              onClick={promoteDetectedLink}
            >
              링크를 아래 링크 버튼으로 올려주세요
            </button>
          )}

          <div className="modal-attach-bar">
            <button
              type="button"
              className={`modal-attach-btn ${showImage ? "modal-attach-btn-active" : ""}`}
              onClick={() => setShowImage(!showImage)}
            >
              🖼️ 이미지{countByKind("image") > 0 && ` · ${countByKind("image")}`}
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

          {totalCount >= MAX_ATTACHMENTS_PER_CARD && (
            <p className="modal-attach-notice">
              첨부는 카드당 최대 {MAX_ATTACHMENTS_PER_CARD}개까지예요.
            </p>
          )}

          {showImage && (
            <div className="modal-attach-section">
              <div className="modal-attach-list">
                {attachments
                  .filter((a) => a.kind === "image")
                  .map((a) => (
                    <div
                      key={a.tempId}
                      className="modal-attach-list-item modal-attach-list-item-image"
                    >
                      <img
                        src={a.url}
                        alt={a.fileName ?? ""}
                        className="modal-attach-image-preview"
                      />
                      <div className="modal-attach-reorder modal-attach-reorder-overlay">
                        <button
                          type="button"
                          className="modal-attach-reorder-btn"
                          onClick={() => moveAttachment(a.tempId, -1)}
                          disabled={isFirstOfKind(a.tempId)}
                          aria-label="위로"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="modal-attach-reorder-btn"
                          onClick={() => moveAttachment(a.tempId, 1)}
                          disabled={isLastOfKind(a.tempId)}
                          aria-label="아래로"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        className="modal-attach-item-remove"
                        onClick={() => removeAttachment(a.tempId)}
                        disabled={isUploading}
                        aria-label="제거"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
              {canAddMore && (
                <div
                  className={`modal-file-drop ${attachmentsUploading ? "is-disabled" : ""}`}
                  aria-disabled={attachmentsUploading}
                  aria-busy={attachmentsUploading}
                  onClick={() => !attachmentsUploading && imageInputRef.current?.click()}
                  onDragOver={(e) => {
                    if (attachmentsUploading) return;
                    e.preventDefault();
                    e.currentTarget.classList.add("drag-over");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    if (attachmentsUploading) return;
                    const fs = Array.from(e.dataTransfer.files).filter((f) =>
                      f.type.startsWith("image/")
                    );
                    if (fs.length > 0) void uploadMany(fs, "image");
                  }}
                >
                  <span className="modal-file-drop-icon">🖼️</span>
                  <span>
                    {attachmentsUploading
                      ? "업로드 중..."
                      : "클릭 또는 이미지를 드래그 (여러 개 선택 가능)"}
                  </span>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    hidden
                    disabled={attachmentsUploading}
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      if (fs.length > 0) void uploadMany(fs, "image");
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
                    if (f && f.type.startsWith("video/")) void handleVideoUpload(f);
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
                      if (f) void handleVideoUpload(f);
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
export type { EditCardUpdates };
