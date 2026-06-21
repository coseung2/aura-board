"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AddCardData } from "../AddCardModal";
import { useCardAttachments } from "../cards/useCardAttachments";
import {
  AttachmentDownloadLink,
  getAttachmentDisplayName,
} from "../cards/AttachmentDownloadLink";
import { useLinkPreview } from "../useLinkPreview";
import { detectFirstUrl, removeUrlFromText } from "@/lib/link-detection";
import { formatBytes } from "@/lib/file-attachment";

const IMAGE_ACCEPT = "image/*";
const VIDEO_ACCEPT = "video/*";
const FILE_ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx," +
  "text/plain,text/markdown,text/x-markdown,text/html,application/zip,application/x-zip-compressed," +
  ".pdf,.docx,.xlsx,.pptx,.hwp,.hwpx,.txt,.md,.markdown,.html,.htm,.zip";

type Props = {
  onAdd: (data: AddCardData) => Promise<void>;
  onSubmitted?: () => void;
  streamTitlePrompt?: string;
  streamContentPrompt?: string;
  sections?: Array<{ id: string; title: string }>;
};

export function StreamComposer({
  onAdd,
  onSubmitted,
  streamTitlePrompt,
  streamContentPrompt,
  sections,
}: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sectionId, setSectionId] = useState(sections?.[0]?.id ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { preview, loading, fetchPreview, reset } = useLinkPreview();
  const {
    attachments,
    uploading,
    uploadMany,
    removeAttachment,
  } = useCardAttachments();

  const detectedUrl = useMemo(() => detectFirstUrl(content), [content]);
  const explicitLinkUrl = linkUrl.trim();
  const effectiveLinkUrl = explicitLinkUrl || detectedUrl || undefined;
  const canSubmit =
    title.trim().length > 0 ||
    content.trim().length > 0 ||
    attachments.length > 0 ||
    Boolean(effectiveLinkUrl);

  useEffect(() => {
    if (effectiveLinkUrl) fetchPreview(effectiveLinkUrl);
    else reset();
  }, [effectiveLinkUrl, fetchPreview, reset]);

  useEffect(() => {
    if (!sections || sections.length === 0) {
      setSectionId("");
      return;
    }
    setSectionId((current) =>
      sections.some((section) => section.id === current)
        ? current
        : sections[0]?.id ?? "",
    );
  }, [sections]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmed = content.trim();
    if (!canSubmit) return;
    setBusy(true);
    const cleanContent =
      effectiveLinkUrl && effectiveLinkUrl === detectedUrl
        ? removeUrlFromText(trimmed, effectiveLinkUrl)
        : trimmed;
    try {
      await onAdd({
        title: trimmedTitle,
        content: cleanContent,
        linkUrl: effectiveLinkUrl,
        linkTitle: preview?.title ?? undefined,
        linkDesc: preview?.description ?? undefined,
        linkImage: preview?.image ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        sectionId: sectionId || undefined,
      });
      setTitle("");
      setContent("");
      setLinkUrl("");
      setShowLink(false);
      setSectionId(sections?.[0]?.id ?? "");
      attachments.forEach((item) => removeAttachment(item.tempId));
      reset();
      onSubmitted?.();
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  }

  function resizeTextareaBy(delta: number) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const currentHeight = textarea.getBoundingClientRect().height;
    const maxHeight = Math.min(window.innerHeight * 0.7, 560);
    const nextHeight = Math.min(maxHeight, Math.max(92, currentHeight + delta));
    textarea.style.height = `${nextHeight}px`;
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const target = textarea;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = target.getBoundingClientRect().height;
    const maxHeight = Math.min(window.innerHeight * 0.7, 560);

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextHeight = Math.min(
        maxHeight,
        Math.max(92, startHeight + moveEvent.clientY - startY),
      );
      target.style.height = `${nextHeight}px`;
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  return (
    <form className="stream-composer" onSubmit={submit}>
      <input
        type="text"
        className="stream-composer-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={
          streamTitlePrompt?.trim()
            ? streamTitlePrompt.trim()
            : "제목을 입력하세요"
        }
        maxLength={200}
        disabled={busy}
        aria-label="제목"
      />
      <div className="stream-composer-textarea-wrap">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={
            streamContentPrompt?.trim()
              ? streamContentPrompt.trim()
              : "무슨 이야기를 나눌까요?"
          }
          maxLength={5000}
          rows={3}
          disabled={busy}
        />
        <button
          type="button"
          className="stream-composer-resize-handle"
          onPointerDown={handleResizePointerDown}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              resizeTextareaBy(24);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              resizeTextareaBy(-24);
            }
          }}
          aria-label="입력창 높이 조절"
          disabled={busy}
        />
      </div>

      {showLink && (
        <div className="stream-composer-link-field">
          <input
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://..."
            disabled={busy}
          />
        </div>
      )}

      {(attachments.length > 0 || effectiveLinkUrl) && (
        <div className="stream-composer-preview">
          {attachments.map((item) => (
            <div className="stream-composer-attachment" key={item.tempId}>
              {item.kind === "image" ? (
                <img src={item.previewUrl ?? item.url} alt="" />
              ) : item.kind === "video" ? (
                <video src={item.url} poster={item.previewUrl ?? undefined} />
              ) : null}
              <span className="stream-composer-file">
                <span title={getAttachmentDisplayName(item)}>
                  {getAttachmentDisplayName(item)}
                </span>
                {item.fileSize ? <small>{formatBytes(item.fileSize)}</small> : null}
              </span>
              <AttachmentDownloadLink
                attachment={item}
                className="stream-composer-download"
              />
              <button type="button" onClick={() => removeAttachment(item.tempId)}>
                제거
              </button>
            </div>
          ))}
          {effectiveLinkUrl && (
            <div className="stream-composer-link">
              {loading ? (
                <span>링크 미리보기 불러오는 중...</span>
              ) : (
                <>
                  {preview?.image && <img src={preview.image} alt="" />}
                  <span>
                    <strong>{preview?.title ?? effectiveLinkUrl}</strong>
                    {preview?.description && <small>{preview.description}</small>}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="stream-composer-actions">
        <input
          ref={imageInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void uploadMany(files, "image");
            event.target.value = "";
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept={VIDEO_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void uploadMany(files, "video");
            event.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void uploadMany(files, "file");
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={busy || uploading}
        >
          사진
        </button>
        <button
          type="button"
          className={
            showLink || effectiveLinkUrl ? "modal-attach-btn-active" : ""
          }
          onClick={() => setShowLink((value) => !value)}
          disabled={busy || uploading}
        >
          링크
        </button>
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          disabled={busy || uploading}
        >
          영상
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || uploading}
        >
          파일
        </button>
        {sections && sections.length > 0 && (
          <label className="stream-composer-section-field">
            <span className="stream-composer-section-label">섹션</span>
            <select
              className="stream-composer-section-select"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              disabled={busy}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={busy || uploading || !canSubmit}
        >
          게시
        </button>
      </div>
    </form>
  );
}
