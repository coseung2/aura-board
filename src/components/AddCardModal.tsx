"use client";

import { useState, useRef } from "react";
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
  LibraryPickerModal,
  type LibraryAsset,
} from "./cards/LibraryPickerModal";
import { detectFirstUrl, removeUrlFromText } from "@/lib/link-detection";

export type { AttachmentDraft } from "./cards/useCardAttachments";

export type AddCardData = {
  title: string;
  content: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDesc?: string;
  linkImage?: string;
  /** multi-attachment (2026-04-20): 여러 이미지/동영상/파일 리스트. */
  attachments?: AttachmentDraft[];
  color?: string;
  sectionId?: string;
  // When set, the caller should attach this StudentAsset to the created card
  // (POST /api/student-assets/{id}/attach) after the card row exists.
  attachAssetId?: string;
};

type SectionOption = { id: string; title: string };

type Props = {
  onAdd: (data: AddCardData) => Promise<void>;
  onClose: () => void;
  sections?: SectionOption[];
  defaultSectionId?: string;
};

const COLOR_PRESETS = [
  null,
  "#ffd8f4",
  "#c3faf5",
  "#ffe6cd",
  "#fde0f0",
  "#f2f9ff",
  "#ffc6c6",
  "#f6f5f4",
  "#e8f5e9",
  "#fff3e0",
];

// 파일 input accept 문자열 — 모달 JSX에서 여러 번 쓰여서 상수로 분리.
const IMAGE_ACCEPT = "image/*";
const VIDEO_ACCEPT = "video/*";
const AUDIO_ACCEPT = "audio/*";
const FILE_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx," +
  "text/plain,text/markdown,text/x-markdown,text/html,application/zip,application/x-zip-compressed," +
  "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm," +
  ".pdf,.docx,.xlsx,.pptx,.hwp,.hwpx,.txt,.md,.markdown,.html,.htm,.zip,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm";

// meta-download-zone (2026-06-13): linkTitle/linkDesc를 본문(content)에
// Notion 스타일로 합치는 헬퍼. 굵은 제목 / 한 줄 빈 줄 / 설명.
// 둘 다 비면 빈 문자열. 둘 중 하나만 있으면 그 줄만.
export function buildLinkTextBlock(
  title: string | null | undefined,
  description: string | null | undefined
): string {
  const t = (title ?? "").trim();
  const d = (description ?? "").trim();
  if (!t && !d) return "";
  if (t && d) return `**${t}**\n\n${d}`;
  return t || d;
}

export function AddCardModal({
  onAdd,
  onClose,
  sections,
  defaultSectionId,
}: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState(
    defaultSectionId ?? sections?.[0]?.id ?? ""
  );
  const [showImage, setShowImage] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showFile, setShowFile] = useState(false);
  const { preview, loading: previewLoading, fetchPreview } = useLinkPreview();
  const [busy, setBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [pickedAssetId, setPickedAssetId] = useState<string | null>(null);

  const {
    attachments,
    uploading,
    totalCount,
    canAddMore,
    countByKind,
    uploadMany,
    addLibraryImage,
    removeAttachment,
    moveAttachment,
    isFirstOfKind,
    isLastOfKind,
  } = useCardAttachments();
  const detectedContentUrl = linkUrl ? null : detectFirstUrl(content);

  function promoteDetectedLink() {
    if (!detectedContentUrl) return;
    setLinkUrl(detectedContentUrl);
    setContent((text) => removeUrlFromText(text, detectedContentUrl));
    setShowLink(true);
    fetchPreview(detectedContentUrl);
  }

  async function openLibrary() {
    setPickerOpen(true);
    if (libraryAssets === null) {
      setLibraryLoading(true);
      try {
        const res = await fetch("/api/student-assets?scope=mine");
        if (res.ok) {
          const data = (await res.json()) as { assets: LibraryAsset[] };
          setLibraryAssets(data.assets ?? []);
        } else {
          setLibraryAssets([]);
        }
      } catch {
        setLibraryAssets([]);
      } finally {
        setLibraryLoading(false);
      }
    }
  }

  function confirmLibraryPick() {
    if (!pickedAssetId || !libraryAssets) return;
    const picked = libraryAssets.find((a) => a.id === pickedAssetId);
    if (picked) {
      const url = picked.thumbnailUrl ?? picked.fileUrl;
      // 라이브러리 픽은 "이미지" attachment로 추가. attachAssetId는 별도
      // StudentAsset 조인용으로 유지.
      if (addLibraryImage(url)) setShowImage(true);
    }
    setPickerOpen(false);
  }

  return (
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
                `첨부는 카드당 최대 ${MAX_ATTACHMENTS_PER_CARD}개까지 가능합니다.`
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
            // (content)에 Notion 스타일로 합쳐 저장 — 굵은 제목 / 한 줄 빈
            // 줄 / 설명. 카드 상세 모달은 이제 이걸 그대로 본문 영역에 표시.
            const linkTextBlock = buildLinkTextBlock(
              preview?.title,
              preview?.description
            );
            const mergedContent = linkTextBlock
              ? linkTextBlock + (content.trim() ? "\n\n" + content.trim() : "")
              : content.trim();
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
              attachAssetId: pickedAssetId ?? undefined,
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
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요..."
            rows={3}
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
            <button
              type="button"
              className="modal-attach-btn"
              onClick={openLibrary}
              title="내 그림 라이브러리에서 선택"
            >
              🎨 내 라이브러리
            </button>
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
                    f.type.startsWith("image/")
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
                          Bypassing the optimizer is safe — the proxy
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
                    f.type.startsWith("video/")
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
                          {a.fileSize ? formatBytes(a.fileSize) : "—"} ·{" "}
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
                  PDF · Word · Excel · PowerPoint · HWP · TXT · HTML · ZIP (파일당 최대
                  50MB)
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

      {pickerOpen && (
        <LibraryPickerModal
          loading={libraryLoading}
          assets={libraryAssets}
          pickedId={pickedAssetId}
          canConfirm={!!pickedAssetId && canAddMore}
          onPick={setPickedAssetId}
          onClose={() => setPickerOpen(false)}
          onConfirm={confirmLibraryPick}
        />
      )}
    </>
  );
}
