"use client";

import { useId, useRef, useState } from "react";
import type { FeedMediaInput } from "@/lib/feed/types";
import { uploadFile } from "@/lib/upload-client";

type FeedDraft = {
  title: string | null;
  body: string | null;
  media: FeedMediaInput[];
};

type Props = {
  heading: string;
  description?: string;
  submitLabel?: string;
  disabled?: boolean;
  onSubmit: (draft: FeedDraft) => Promise<void>;
};

const MAX_MEDIA_ITEMS = 10;

export function FeedComposer({
  heading,
  description,
  submitLabel = "게시하기",
  disabled = false,
  onSubmit,
}: Props) {
  const imageInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [media, setMedia] = useState<FeedMediaInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = disabled || uploading || submitting;

  async function handleImageFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    const available = Math.max(0, MAX_MEDIA_ITEMS - media.length);
    if (available === 0) {
      setError(`미디어는 최대 ${MAX_MEDIA_ITEMS}개까지 첨부할 수 있어요.`);
      return;
    }

    const selected = Array.from(files).slice(0, available);
    setUploading(true);
    setError(null);
    try {
      const uploadedMedia: FeedMediaInput[] = [];
      for (const file of selected) {
        if (!file.type.startsWith("image/")) {
          throw new Error("피드에는 이미지 파일만 업로드할 수 있어요.");
        }
        const uploaded = await uploadFile(file);
        if (uploaded.type !== "image") {
          throw new Error("이미지 업로드 결과를 확인하지 못했어요.");
        }
        uploadedMedia.push({
          kind: "IMAGE",
          url: uploaded.url,
          altText: file.name,
          youtubeVideoId: null,
        });
      }
      setMedia((current) => [...current, ...uploadedMedia]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "이미지 업로드에 실패했어요.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addYoutube() {
    const normalized = youtubeUrl.trim();
    if (!normalized) return;
    if (media.length >= MAX_MEDIA_ITEMS) {
      setError(`미디어는 최대 ${MAX_MEDIA_ITEMS}개까지 첨부할 수 있어요.`);
      return;
    }
    setMedia((current) => [
      ...current,
      { kind: "YOUTUBE", url: normalized, altText: null },
    ]);
    setYoutubeUrl("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const normalizedTitle = title.trim();
    const normalizedBody = body.trim();
    if (!normalizedTitle && !normalizedBody && media.length === 0) {
      setError("제목, 본문 또는 미디어 중 하나를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: normalizedTitle || null,
        body: normalizedBody || null,
        media,
      });
      setTitle("");
      setBody("");
      setYoutubeUrl("");
      setMedia([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "게시물을 저장하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ab-feed-composer" onSubmit={handleSubmit}>
      <div className="ab-feed-composer-heading">
        <div>
          <h2>{heading}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {submitting ? "게시 중…" : uploading ? "업로드 중…" : submitLabel}
        </button>
      </div>

      <label className="ab-feed-field">
        <span>제목</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="짧은 제목을 적어 보세요"
          disabled={busy}
        />
      </label>
      <label className="ab-feed-field">
        <span>내용</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={10_000}
          rows={4}
          placeholder="우리 반과 나누고 싶은 이야기를 적어 보세요"
          disabled={busy}
        />
      </label>

      <div className="ab-feed-media-tools">
        <div className="ab-feed-media-tool-row">
          <input
            ref={fileInputRef}
            id={imageInputId}
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            disabled={busy || media.length >= MAX_MEDIA_ITEMS}
            onChange={(event) => void handleImageFiles(event.target.files)}
          />
          <label className="btn btn-secondary" htmlFor={imageInputId} aria-disabled={busy}>
            이미지 추가
          </label>
          <span className="ab-feed-media-count">{media.length}/{MAX_MEDIA_ITEMS}</span>
        </div>
        <div className="ab-feed-youtube-row">
          <input
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="YouTube 주소"
            inputMode="url"
            disabled={busy || media.length >= MAX_MEDIA_ITEMS}
          />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy || !youtubeUrl.trim() || media.length >= MAX_MEDIA_ITEMS}
            onClick={addYoutube}
          >
            추가
          </button>
        </div>
      </div>

      {media.length ? (
        <ul className="ab-feed-media-list" aria-label="첨부 미디어">
          {media.map((item, index) => (
            <li key={`${item.kind}:${item.url}:${index}`}>
              <span className="ab-feed-media-kind">
                {item.kind === "IMAGE" ? "이미지" : "YouTube"}
              </span>
              <span className="ab-feed-media-url">{item.altText || item.url}</span>
              <button
                type="button"
                className="ab-feed-remove-media"
                onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                disabled={busy}
                aria-label={`${index + 1}번째 미디어 제거`}
              >
                제거
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="ab-feed-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export type { FeedDraft };
