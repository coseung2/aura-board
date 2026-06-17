"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AddCardData } from "../AddCardModal";
import { useCardAttachments } from "../cards/useCardAttachments";
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
};

export function StreamComposer({ onAdd }: Props) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    if (detectedUrl) fetchPreview(detectedUrl);
    else reset();
  }, [detectedUrl, fetchPreview, reset]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) return;
    setBusy(true);
    const linkUrl = detectedUrl ?? undefined;
    const cleanContent = linkUrl ? removeUrlFromText(trimmed, linkUrl) : trimmed;
    try {
      await onAdd({
        title: "",
        content: cleanContent,
        linkUrl,
        linkTitle: preview?.title ?? undefined,
        linkDesc: preview?.description ?? undefined,
        linkImage: preview?.image ?? undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent("");
      attachments.forEach((item) => removeAttachment(item.tempId));
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stream-composer" onSubmit={submit}>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="무슨 이야기를 나눌까요?"
        maxLength={5000}
        rows={3}
        disabled={busy}
      />

      {(attachments.length > 0 || detectedUrl) && (
        <div className="stream-composer-preview">
          {attachments.map((item) => (
            <div className="stream-composer-attachment" key={item.tempId}>
              {item.kind === "image" ? (
                <img src={item.previewUrl ?? item.url} alt="" />
              ) : item.kind === "video" ? (
                <video src={item.url} poster={item.previewUrl ?? undefined} />
              ) : (
                <span className="stream-composer-file">
                  {item.fileName ?? "파일"}
                  {item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ""}
                </span>
              )}
              <button type="button" onClick={() => removeAttachment(item.tempId)}>
                제거
              </button>
            </div>
          ))}
          {detectedUrl && (
            <div className="stream-composer-link">
              {loading ? (
                <span>링크 미리보기 불러오는 중...</span>
              ) : (
                <>
                  {preview?.image && <img src={preview.image} alt="" />}
                  <span>
                    <strong>{preview?.title ?? detectedUrl}</strong>
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
        <button type="button" onClick={() => imageInputRef.current?.click()} disabled={busy || uploading}>
          사진
        </button>
        <button type="button" onClick={() => videoInputRef.current?.click()} disabled={busy || uploading}>
          영상
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || uploading}>
          파일
        </button>
        <button type="submit" disabled={busy || uploading || (!content.trim() && attachments.length === 0)}>
          게시
        </button>
      </div>
    </form>
  );
}
