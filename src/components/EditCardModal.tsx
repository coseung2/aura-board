"use client";

import { useState, useRef } from "react";
import type { CardData } from "./DraggableCard";
import {
  fileMimeToIcon,
  fileMimeToLabel,
  formatBytes,
  MAX_ATTACHMENTS_PER_CARD,
} from "@/lib/file-attachment";
import {
  useCardAttachments,
  type AttachmentDraft,
} from "./cards/useCardAttachments";
import {
  AttachmentDownloadLink,
  getAttachmentDisplayName,
} from "./cards/AttachmentDownloadLink";
import { detectFirstUrl, removeUrlFromText } from "@/lib/link-detection";
import { buildLinkTextBlock } from "./AddCardModal";

const COLOR_PRESETS = [
  null, "#ffd8f4", "#c3faf5", "#ffe6cd", "#fde0f0",
  "#f2f9ff", "#ffc6c6", "#f6f5f4", "#e8f5e9", "#fff3e0",
];

const IMAGE_ACCEPT = "image/*";
const VIDEO_ACCEPT = "video/*";
const FILE_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx," +
  "text/plain,text/markdown,text/x-markdown,text/html,application/zip,application/x-zip-compressed," +
  "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm," +
  ".pdf,.docx,.xlsx,.pptx,.hwp,.hwpx,.txt,.md,.markdown,.html,.htm,.zip,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm";

export type EditCardUpdates = Omit<Partial<CardData>, "attachments"> & {
  attachments?: AttachmentDraft[];
};

type Props = {
  card: CardData;
  onSave: (updates: EditCardUpdates) => Promise<void>;
  onClose: () => void;
};

// useCardMutations의 optimistic update에서 id로 그대로 흘러가지 않도록
// legacy 형식 tempId는 안전한 임시 id로 치환. server는 createMany로 새 row를
// 만들어 실제 id를 다시 내려보내므로 이 가짜 id는 UI 렌더 키 용도로만 쓰임.
function safeAttachmentId(tempId: string, idx: number): string {
  if (!tempId) return `tmp-${idx}`;
  return tempId.startsWith("legacy-") ? `tmp-${idx}` : tempId;
}

function toInitialAttachments(card: CardData): AttachmentDraft[] {
  const normalized: AttachmentDraft[] = (card.attachments ?? [])
    .filter((a) => a.kind === "image" || a.kind === "video" || a.kind === "file")
    .sort((a, b) => a.order - b.order)
    .map((a, idx) => ({
      tempId: a.id && !a.id.startsWith("legacy-") ? a.id : `tmp-${idx}`,
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
      tempId: `tmp-legacy-${card.id}`,
      kind: "image",
      url: card.imageUrl,
    });
  }
  if (card.videoUrl && !normalized.some((a) => a.kind === "video" && a.url === card.videoUrl)) {
    normalized.push({
      tempId: `tmp-legacy-video-${card.id}`,
      kind: "video",
      url: card.videoUrl,
    });
  }
  if (card.fileUrl && !normalized.some((a) => a.kind === "file" && a.url === card.fileUrl)) {
    normalized.push({
      tempId: `tmp-legacy-file-${card.id}`,
      kind: "file",
      url: card.fileUrl,
      fileName: card.fileName ?? undefined,
      fileSize: card.fileSize ?? undefined,
      mimeType: card.fileMimeType ?? undefined,
    });
  }

  return normalized;
}

export function EditCardModal({ card, onSave, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [linkUrl, setLinkUrl] = useState(card.linkUrl ?? "");
  const [color, setColor] = useState<string | null>(card.color);
  const [showImage, setShowImage] = useState(
    Boolean(card.imageUrl) || (card.attachments ?? []).some((a) => a.kind === "image")
  );
  const [showLink, setShowLink] = useState(!!card.linkUrl);
  const [showVideo, setShowVideo] = useState(
    Boolean(card.videoUrl) || (card.attachments ?? []).some((a) => a.kind === "video")
  );
  const [showFile, setShowFile] = useState(
    Boolean(card.fileUrl) || (card.attachments ?? []).some((a) => a.kind === "file")
  );
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const isUploading = attachmentsUploading;
  const detectedContentUrl = linkUrl ? null : detectFirstUrl(content);

  function promoteDetectedLink() {
    if (!detectedContentUrl) return;
    setLinkUrl(detectedContentUrl);
    setContent((text) => removeUrlFromText(text, detectedContentUrl));
    setShowLink(true);
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
            const firstVideo = payloadAttachments.find((a) => a.kind === "video");
            const firstFile = payloadAttachments.find((a) => a.kind === "file");
            const hasCardBody =
              title.trim().length > 0 ||
              content.trim().length > 0 ||
              Boolean(linkUrl) ||
              payloadAttachments.length > 0;
            if (!hasCardBody) return;
            // meta-download-zone (2026-06-13): linkTitle/linkDesc를 본문에
            // Notion 스타일로 합쳐 저장. AddCardModal과 동일 헬퍼 사용.
            const linkTextBlock = buildLinkTextBlock(
              card.linkTitle,
              card.linkDesc
            );
            const mergedContent = linkTextBlock
              ? linkTextBlock + (content.trim() ? "\n\n" + content.trim() : "")
              : content.trim();
            await onSave({
              title: title.trim(),
              content: mergedContent,
              imageUrl: firstImage?.url ?? null,
              attachments: payloadAttachments,
              linkUrl: linkUrl || null,
              videoUrl: firstVideo?.url ?? null,
              fileUrl: firstFile?.url ?? null,
              fileName: firstFile?.fileName ?? null,
              fileSize: firstFile?.fileSize ?? null,
              fileMimeType: firstFile?.mimeType ?? null,
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
              {countByKind("video") > 0 && ` · ${countByKind("video")}`}
            </button>
            <button
              type="button"
              className={`modal-attach-btn ${showFile ? "modal-attach-btn-active" : ""}`}
              onClick={() => setShowFile(!showFile)}
              aria-label="파일 첨부"
            >
              📎 파일{countByKind("file") > 0 && ` · ${countByKind("file")}`}
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
                      <div className="modal-attach-filebar">
                        <span
                          className="modal-attach-filebar-name"
                          title={getAttachmentDisplayName(a)}
                        >
                          {getAttachmentDisplayName(a)}
                        </span>
                        <AttachmentDownloadLink
                          attachment={a}
                          className="modal-attach-download"
                        />
                      </div>
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
              <div className="modal-attach-list">
                {attachments
                  .filter((a) => a.kind === "video")
                  .map((a) => (
                    <div
                      key={a.tempId}
                      className="modal-attach-list-item modal-attach-list-item-video"
                    >
                      <video
                        src={a.url}
                        className="modal-preview-video-file"
                        preload="metadata"
                        controls
                      />
                      <div className="modal-attach-filebar">
                        <span
                          className="modal-attach-filebar-name"
                          title={getAttachmentDisplayName(a)}
                        >
                          {getAttachmentDisplayName(a)}
                        </span>
                        <AttachmentDownloadLink
                          attachment={a}
                          className="modal-attach-download"
                        />
                      </div>
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
                  className={`modal-file-drop ${isUploading ? "is-disabled" : ""}`}
                  aria-disabled={isUploading}
                  aria-busy={isUploading}
                  onClick={() => !isUploading && videoInputRef.current?.click()}
                  onDragOver={(e) => {
                    if (isUploading) return;
                    e.preventDefault();
                    e.currentTarget.classList.add("drag-over");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    if (isUploading) return;
                    const fs = Array.from(e.dataTransfer.files).filter((f) =>
                      f.type.startsWith("video/")
                    );
                    if (fs.length > 0) void uploadMany(fs, "video");
                  }}
                >
                  <span className="modal-file-drop-icon">🎬</span>
                  <span>{isUploading ? "업로드 중..." : "클릭 또는 동영상을 드래그"}</span>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept={VIDEO_ACCEPT}
                    multiple
                    hidden
                    disabled={isUploading}
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      if (fs.length > 0) void uploadMany(fs, "video");
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {showFile && (
            <div className="modal-attach-section">
              <div className="modal-attach-list">
                {attachments
                  .filter((a) => a.kind === "file")
                  .map((a) => (
                    <div
                      key={a.tempId}
                      className="modal-file-preview modal-file-preview-file"
                    >
                      <span className="modal-file-preview-icon" aria-hidden>
                        {fileMimeToIcon(a.mimeType ?? "")}
                      </span>
                      <div className="modal-file-preview-body">
                        <span
                          className="modal-file-preview-name"
                          title={a.fileName ?? ""}
                        >
                          {a.fileName ?? "파일"}
                        </span>
                        <span className="modal-file-preview-meta">
                          {a.fileSize ? formatBytes(a.fileSize) : "-"} ·{" "}
                          {fileMimeToLabel(a.mimeType ?? "")}
                        </span>
                      </div>
                      <div className="modal-attach-reorder">
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
                      <AttachmentDownloadLink
                        attachment={a}
                        className="modal-file-download"
                      />
                      <button
                        type="button"
                        className="modal-file-remove"
                        onClick={() => removeAttachment(a.tempId)}
                        disabled={isUploading}
                      >
                        제거
                      </button>
                    </div>
                  ))}
              </div>
              {canAddMore && (
                <div
                  className={`modal-file-drop ${isUploading ? "is-disabled" : ""}`}
                  aria-disabled={isUploading}
                  aria-busy={isUploading}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    if (isUploading) return;
                    e.preventDefault();
                    e.currentTarget.classList.add("drag-over");
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("drag-over");
                    if (isUploading) return;
                    const fs = Array.from(e.dataTransfer.files);
                    if (fs.length > 0) void uploadMany(fs, "file");
                  }}
                >
                  <span className="modal-file-drop-icon">📎</span>
                  <span>
                    {isUploading
                      ? "업로드 중..."
                      : "클릭 또는 파일을 드래그 (여러 개 선택 가능)"}
                  </span>
                  <span className="modal-file-drop-hint">
                    PDF · Word · Excel · PowerPoint · HWP · TXT · HTML · ZIP (파일당 최대
                    50MB)
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={FILE_ACCEPT}
                    multiple
                    hidden
                    disabled={isUploading}
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      if (fs.length > 0) void uploadMany(fs, "file");
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
            <button type="submit" disabled={busy || isUploading} className="modal-btn-submit">
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
