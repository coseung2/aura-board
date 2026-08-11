"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useLinkPreview } from "./useLinkPreview";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
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
import { AddCardAuthorPicker } from "./AddCardAuthorPicker";
import {
  COLOR_PRESETS,
  FILE_ACCEPT,
  IMAGE_ACCEPT,
  VIDEO_ACCEPT,
  buildLinkTextBlock,
  type AddCardData,
  type AuthorDraftRow,
  type SectionOption,
} from "./add-card-modal-model";

export type { AttachmentDraft } from "./cards/useCardAttachments";
export type { AddCardData, CardAuthorDraft } from "./add-card-modal-model";
export { buildLinkTextBlock } from "./add-card-modal-model";

type Props = {
  onAdd: (data: AddCardData) => Promise<void>;
  onClose: () => void;
  sections?: SectionOption[];
  defaultSectionId?: string;
  canAssignAuthors?: boolean;
  canConfigurePoll?: boolean;
  classroomId?: string | null;
};

export function AddCardModal({
  onAdd,
  onClose,
  sections,
  defaultSectionId,
  canAssignAuthors = false,
  canConfigurePoll = canAssignAuthors,
  classroomId,
}: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState(
    defaultSectionId ?? sections?.[0]?.id ?? "",
  );
  const [showImage, setShowImage] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showFile, setShowFile] = useState(false);
  const [showAuthors, setShowAuthors] = useState(false);
  const [authorRows, setAuthorRows] = useState<AuthorDraftRow[]>([]);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptionCount, setPollOptionCount] = useState<number>(2);
  const [pollOptionLabels, setPollOptionLabels] = useState<string[]>(
    Array.from({ length: 6 }, (_, idx) => `${idx + 1}번`),
  );
  const { preview, loading: previewLoading, fetchPreview } = useLinkPreview();
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeState = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  const {
    attachments,
    uploading,
    totalCount,
    canAddMore,
    countByKind,
    uploadMany,
    removeAttachment,
    moveAttachment,
    isFirstOfKind,
    isLastOfKind,
  } = useCardAttachments();
  const detectedContentUrl = linkUrl ? null : detectFirstUrl(content);

  useEffect(() => {
    setMounted(true);
  }, []);

  function startTextareaResize(e: React.PointerEvent) {
    e.preventDefault();
    const ta = textareaRef.current;
    if (!ta) return;
    resizeState.current = { startY: e.clientY, startHeight: ta.offsetHeight };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveTextareaResize(e: React.PointerEvent) {
    if (!resizeState.current || !textareaRef.current) return;
    const delta = e.clientY - resizeState.current.startY;
    const next = Math.max(72, resizeState.current.startHeight + delta);
    textareaRef.current.style.height = `${next}px`;
  }

  function endTextareaResize(e: React.PointerEvent) {
    resizeState.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  function promoteDetectedLink() {
    if (!detectedContentUrl) return;
    setLinkUrl(detectedContentUrl);
    setContent((text) => removeUrlFromText(text, detectedContentUrl));
    setShowLink(true);
    fetchPreview(detectedContentUrl);
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal">
        <div className="modal-header">
          <h2 className="modal-title">새 카드 만들기</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form
          className="modal-body"
          onSubmit={async (e) => {
            e.preventDefault();
            // codex H3: 제출 전 authoritative 상한 검증.
            if (attachments.length > MAX_ATTACHMENTS_PER_CARD) {
              alert(
                `첨부는 카드당 최대 ${MAX_ATTACHMENTS_PER_CARD}개까지 가능합니다.`,
              );
              return;
            }
            setBusy(true);
            // attachments는 서버에 전달할 때 tempId 제거한 순수 payload로 변환.
            const payloadAttachments = attachments.map((a) => ({
              kind: a.kind,
              url: a.url,
              previewUrl: a.previewUrl ?? null,
              fileName: a.fileName,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
            })) as AttachmentDraft[];
            const hasCardBody =
              title.trim().length > 0 ||
              content.trim().length > 0 ||
              Boolean(linkUrl) ||
              payloadAttachments.length > 0;
            if (!hasCardBody) return;
            // meta-download-zone (2026-06-13): linkTitle/linkDesc를 본문
            // (content)에 Notion 스타일로 합쳐 저장 - 굵은 제목 / 한 줄 빈
            // 줄 / 설명. 카드 상세 모달은 이제 이걸 그대로 본문 영역에 표시.
            const linkTextBlock = buildLinkTextBlock(
              preview?.title,
              preview?.description,
            );
            const mergedContent = linkTextBlock
              ? linkTextBlock + (content.trim() ? "\n\n" + content.trim() : "")
              : content.trim();
            const authors = authorRows
              .map((a) => ({
                studentId: a.studentId,
                displayName: a.displayName.trim(),
              }))
              .filter((a) => a.displayName.length > 0);
            await onAdd({
              title: title.trim(),
              content: mergedContent,
              linkUrl: linkUrl || undefined,
              linkTitle: preview?.title || undefined,
              linkDesc: preview?.description || undefined,
              linkImage: preview?.image || undefined,
              attachments:
                payloadAttachments.length > 0 ? payloadAttachments : undefined,
              color: color || undefined,
              sectionId: sectionId || undefined,
              authors: authors.length > 0 ? authors : undefined,
              ...(canConfigurePoll
                ? {
                    commentVoteOptionCount: pollEnabled ? pollOptionCount : null,
                    commentVoteOptionLabels: pollEnabled
                      ? pollOptionLabels.slice(0, pollOptionCount)
                      : null,
                  }
                : {}),
            });
            setBusy(false);
            onClose();
          }}
        >
          {sections && sections.length > 0 && (
            <>
              <label className="modal-field-label">섹션</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="modal-select"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </>
          )}

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
          <div className="modal-textarea-wrap">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용을 입력하세요..."
              rows={3}
              className="modal-textarea"
              maxLength={5000}
            />
            <div
              className="modal-textarea-grip"
              onPointerDown={startTextareaResize}
              onPointerMove={moveTextareaResize}
              onPointerUp={endTextareaResize}
              onPointerCancel={endTextareaResize}
              aria-hidden="true"
            />
          </div>
          {detectedContentUrl && (
            <button
              type="button"
              className="modal-link-promote"
              onClick={promoteDetectedLink}
            >
              링크를 아래 링크 버튼으로 올려주세요
            </button>
          )}

          {/* ── 첨부 버튼 바 ── */}
          <div className="modal-attach-bar">
            <button
              type="button"
              className={`modal-attach-btn ${showImage ? "modal-attach-btn-active" : ""}`}
              onClick={() => setShowImage(!showImage)}
            >
              🖼️ 이미지
              {countByKind("image") > 0 && ` · ${countByKind("image")}`}
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
            {canAssignAuthors && (
              <button
                type="button"
                className={`modal-attach-btn ${showAuthors ? "modal-attach-btn-active" : ""}`}
                onClick={() => setShowAuthors(!showAuthors)}
              >
                👥 작성자
                {authorRows.length > 0 && ` · ${authorRows.length}`}
              </button>
            )}
          </div>

          {totalCount >= MAX_ATTACHMENTS_PER_CARD && (
            <p className="modal-attach-notice">
              첨부는 카드당 최대 {MAX_ATTACHMENTS_PER_CARD}개까지예요.
            </p>
          )}

          {/* ── 이미지 섹션 ── */}
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
                        aria-label="제거"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
              <div
                className={`modal-file-drop ${!canAddMore ? "is-disabled" : ""}`}
                onClick={() => canAddMore && imageInputRef.current?.click()}
                onDragOver={(e) => {
                  if (!canAddMore) return;
                  e.preventDefault();
                  e.currentTarget.classList.add("drag-over");
                }}
                onDragLeave={(e) =>
                  e.currentTarget.classList.remove("drag-over")
                }
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("drag-over");
                  if (!canAddMore) return;
                  const fs = Array.from(e.dataTransfer.files).filter((f) =>
                    f.type.startsWith("image/"),
                  );
                  if (fs.length > 0) void uploadMany(fs, "image");
                }}
              >
                <span className="modal-file-drop-icon">🖼️</span>
                <span>
                  {uploading
                    ? "업로드 중..."
                    : "클릭 또는 이미지를 드래그 (여러 개 선택 가능)"}
                </span>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  multiple
                  hidden
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    if (fs.length > 0) void uploadMany(fs, "image");
                    // 같은 파일 재선택 가능하게 리셋
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {/* ── 링크 (개별 토글) ── */}
          {showLink && (
            <div className="modal-attach-section">
              <input
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  fetchPreview(e.target.value);
                }}
                placeholder="https://..."
                className="modal-input"
                type="url"
              />
              {previewLoading && (
                <div className="link-preview-loading">
                  미리보기 가져오는 중...
                </div>
              )}
              {preview && (preview.title || preview.image) && (
                <div className="link-preview-card">
                  {preview.image && (
                    <div className="link-preview-card-image optimized-img-wrap">
                      {/* unoptimized: preview.image is already our
                          /api/link-preview/image proxy URL (Google User
                          Content blocked next/image's optimizer fetch
                          from the Vercel edge for channel avatars).
                          Bypassing the optimizer is safe - the proxy
                          already enforces size + content-type limits. */}
                      <OptimizedImage
                        src={preview.image}
                        alt=""
                        sizes="160px"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="link-preview-card-body">
                    {preview.title && (
                      <div className="link-preview-card-title">
                        {preview.title}
                      </div>
                    )}
                    {preview.description && (
                      <div className="link-preview-card-desc">
                        {preview.description}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 동영상 섹션 ── */}
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
                        aria-label="제거"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
              <div
                className={`modal-file-drop ${!canAddMore ? "is-disabled" : ""}`}
                onClick={() => canAddMore && videoInputRef.current?.click()}
                onDragOver={(e) => {
                  if (!canAddMore) return;
                  e.preventDefault();
                  e.currentTarget.classList.add("drag-over");
                }}
                onDragLeave={(e) =>
                  e.currentTarget.classList.remove("drag-over")
                }
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("drag-over");
                  if (!canAddMore) return;
                  const fs = Array.from(e.dataTransfer.files).filter((f) =>
                    f.type.startsWith("video/"),
                  );
                  if (fs.length > 0) void uploadMany(fs, "video");
                }}
              >
                <span className="modal-file-drop-icon">🎬</span>
                <span>
                  {uploading ? "업로드 중..." : "클릭 또는 동영상을 드래그"}
                </span>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={VIDEO_ACCEPT}
                  multiple
                  hidden
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    if (fs.length > 0) void uploadMany(fs, "video");
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {/* ── 파일 섹션 ── */}
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
                      >
                        제거
                      </button>
                    </div>
                  ))}
              </div>
              <div
                className={`modal-file-drop ${!canAddMore ? "is-disabled" : ""}`}
                onClick={() => canAddMore && fileInputRef.current?.click()}
                onDragOver={(e) => {
                  if (!canAddMore) return;
                  e.preventDefault();
                  e.currentTarget.classList.add("drag-over");
                }}
                onDragLeave={(e) =>
                  e.currentTarget.classList.remove("drag-over")
                }
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("drag-over");
                  if (!canAddMore) return;
                  const fs = Array.from(e.dataTransfer.files);
                  if (fs.length > 0) void uploadMany(fs, "file");
                }}
              >
                <span className="modal-file-drop-icon">📎</span>
                <span>
                  {uploading
                    ? "업로드 중..."
                    : "클릭 또는 파일을 드래그 (여러 개 선택 가능)"}
                </span>
                <span className="modal-file-drop-hint">
                  PDF · Word · Excel · PowerPoint · HWP · TXT · HTML · ZIP
                  (파일당 최대 50MB)
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_ACCEPT}
                  multiple
                  hidden
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []);
                    if (fs.length > 0) void uploadMany(fs, "file");
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {canAssignAuthors && showAuthors && (
            <AddCardAuthorPicker
              classroomId={classroomId ?? null}
              rows={authorRows}
              onChange={setAuthorRows}
            />
          )}

          {canConfigurePoll && (
            <div className="modal-poll-section">
              <span className="modal-field-label">댓글 투표</span>
              <label className="modal-poll-enable">
                <input
                  type="checkbox"
                  checked={pollEnabled}
                  onChange={(e) => {
                    setPollEnabled(e.target.checked);
                    if (e.target.checked) setPollOptionCount(2);
                  }}
                />
                댓글창에서 투표 받기
              </label>
              {pollEnabled && (
                <select
                  value={pollOptionCount}
                  onChange={(e) => setPollOptionCount(Number(e.target.value))}
                  className="modal-select"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}개 선택지
                    </option>
                  ))}
                </select>
              )}
              {pollEnabled && (
                <div className="modal-poll-label-grid">
                  {Array.from({ length: pollOptionCount }, (_, idx) => (
                    <label key={idx} className="modal-poll-label-field">
                      <span>{idx + 1}</span>
                      <input
                        value={pollOptionLabels[idx] ?? `${idx + 1}번`}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPollOptionLabels((current) => {
                            const next = [...current];
                            next[idx] = value;
                            return next;
                          });
                        }}
                        maxLength={40}
                        placeholder={`${idx + 1}번`}
                      />
                    </label>
                  ))}
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
            <button
              type="button"
              onClick={onClose}
              disabled={busy || uploading}
              className="modal-btn-cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy || uploading}
              className="modal-btn-submit"
            >
              {busy ? "추가 중..." : "카드 추가"}
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
