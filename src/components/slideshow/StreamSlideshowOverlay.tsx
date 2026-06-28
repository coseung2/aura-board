"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatRelativeTime } from "@/lib/card-engagement-format";
import { isYouTubeLink } from "@/lib/card-content-policy";
import { buildCanvaEmbedSrc } from "@/lib/canva";
import { extractVideoId } from "@/lib/youtube";
import type { CardData } from "../DraggableCard";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "../icons/UiIcons";
import { getStreamAuthor } from "../stream/stream-author";
import { StreamActivityTemplatePanel } from "../stream/StreamActivityTemplatePanel";
import { STREAM_ACTIVITY_TEMPLATE_LABELS } from "@/lib/stream-activity-templates";
import type { SlideshowSlide } from "./BoardSlideshowProvider";

type Props = {
  slides: SlideshowSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

type MediaItem = {
  id: string;
  kind: "image" | "video" | "youtube" | "canva";
  url: string;
  previewUrl?: string | null;
  alt: string;
};

export function StreamSlideshowOverlay({
  slides,
  index,
  onIndexChange,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  const total = slides.length;
  const safeIndex = Math.min(index, total - 1);
  const slide = slides[safeIndex];
  const isSectionSlide = slide?.kind === "section";
  const isActivitySlide = slide?.kind === "activity";
  const mediaItems =
    slide && slide.card ? buildSlideshowMedia(slide.card) : [];
  const cardLinkUrl = slide?.card?.linkUrl ?? null;
  const cardLinkTitle = slide?.card?.linkTitle ?? null;
  const [resolvedYouTubeTitle, setResolvedYouTubeTitle] = useState<string | null>(null);

  const go = useCallback(
    (next: number) => {
      if (total <= 1) return;
      const bounded = (next + total) % total;
      onIndexChange(bounded);
    },
    [total, onIndexChange],
  );

  // Keyboard: ArrowRight/PageDown goes next, ArrowLeft/PageUp goes previous,
  // Escape closes the overlay.
  useEffect(() => {
    if (!slide) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        go(safeIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(safeIndex - 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, safeIndex, onClose, slide]);

  useEffect(() => {
    if (!slide) return;
    setMediaIndex(0);
  }, [slide?.id]);

  useEffect(() => {
    if (mediaIndex >= mediaItems.length) setMediaIndex(0);
  }, [mediaIndex, mediaItems.length]);

  useEffect(() => {
    if (!cardLinkUrl || !extractVideoId(cardLinkUrl) || cardLinkTitle?.trim()) {
      setResolvedYouTubeTitle(null);
      return;
    }
    let alive = true;
    fetch(`/api/link-preview?url=${encodeURIComponent(cardLinkUrl)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { title?: string | null } | null) => {
        if (!alive) return;
        setResolvedYouTubeTitle(data?.title?.trim() || null);
      })
      .catch(() => {
        if (alive) setResolvedYouTubeTitle(null);
      });
    return () => {
      alive = false;
    };
  }, [cardLinkTitle, cardLinkUrl]);

  if (!mounted || !slide) return null;

  const card = slide.card;
  // Section-title slides render a large centered title and skip media/author.
  if (isSectionSlide) {
    return createPortal(
      <div
        className={`slideshow-overlay slideshow-overlay-section ${
          controlsVisible ? "is-controls-visible" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="섹션 제목 슬라이드"
        onPointerMove={revealControls}
        onPointerDown={revealControls}
        onFocusCapture={revealControls}
      >
        <div className="slideshow-topbar">
          <div className="slideshow-meta">
            <span className="slideshow-meta-app">Aura Board</span>
            <span className="slideshow-meta-sep" aria-hidden="true">·</span>
            <span className="slideshow-meta-author">섹션</span>
          </div>
          <div className="slideshow-topbar-right">
            <span className="slideshow-position" aria-live="polite">
              {safeIndex + 1} / {total}
            </span>
            <button
              type="button"
              className="ui-icon-action slideshow-close"
              onClick={onClose}
              aria-label="슬라이드쇼 닫기"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>
        <div className="slideshow-section-stage">
          <h2 className="slideshow-section-title">
            {slide.sectionTitle ?? "섹션"}
          </h2>
        </div>
        <div className="slideshow-controls">
          <button
            type="button"
            className="slideshow-nav slideshow-prev"
            onClick={() => go(safeIndex - 1)}
            disabled={total <= 1}
            aria-label="이전 슬라이드"
          >
            <ChevronLeftIcon size={24} />
          </button>
          <div
            className="slideshow-slide-indicators"
            aria-label={`슬라이드 ${safeIndex + 1} / ${total}`}
          >
            {slides.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={i === safeIndex ? "is-active" : ""}
                aria-label={`${i + 1}번째 슬라이드 보기`}
                aria-current={i === safeIndex ? "true" : undefined}
                onClick={() => onIndexChange(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="slideshow-nav slideshow-next"
            onClick={() => go(safeIndex + 1)}
            disabled={total <= 1}
            aria-label="다음 슬라이드"
          >
            <ChevronRightIcon size={24} />
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  if (isActivitySlide && slide.activityTemplate) {
    return createPortal(
      <div
        className={`slideshow-overlay slideshow-overlay-section slideshow-overlay-activity ${
          controlsVisible ? "is-controls-visible" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="활동 템플릿 슬라이드"
        onPointerMove={revealControls}
        onPointerDown={revealControls}
        onFocusCapture={revealControls}
      >
        <div className="slideshow-topbar">
          <div className="slideshow-meta">
            <span className="slideshow-meta-app">Aura Board</span>
            <span className="slideshow-meta-sep" aria-hidden="true">·</span>
            <span className="slideshow-meta-author">
              {slide.sectionTitle ?? "섹션"}
            </span>
            <span className="slideshow-meta-sep" aria-hidden="true">·</span>
            <span className="slideshow-meta-author">
              {STREAM_ACTIVITY_TEMPLATE_LABELS[slide.activityTemplate]}
            </span>
          </div>
          <div className="slideshow-topbar-right">
            <span className="slideshow-position" aria-live="polite">
              {safeIndex + 1} / {total}
            </span>
            <button
              type="button"
              className="ui-icon-action slideshow-close"
              onClick={onClose}
              aria-label="슬라이드쇼 닫기"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>
        <div className="slideshow-activity-stage">
          <StreamActivityTemplatePanel
            template={slide.activityTemplate}
            sectionId={slide.sectionId ?? ""}
            cards={slide.cards ?? []}
            canEdit={false}
            isTeacherView={false}
            state={slide.activityTemplateState ?? null}
            onCreateCard={async () => {}}
          />
        </div>
        <div className="slideshow-controls">
          <button
            type="button"
            className="slideshow-nav slideshow-prev"
            onClick={() => go(safeIndex - 1)}
            disabled={total <= 1}
            aria-label="이전 슬라이드"
          >
            <ChevronLeftIcon size={24} />
          </button>
          <div
            className="slideshow-slide-indicators"
            aria-label={`슬라이드 ${safeIndex + 1} / ${total}`}
          >
            {slides.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={i === safeIndex ? "is-active" : ""}
                aria-label={`${i + 1}번째 슬라이드 보기`}
                aria-current={i === safeIndex ? "true" : undefined}
                onClick={() => onIndexChange(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="slideshow-nav slideshow-next"
            onClick={() => go(safeIndex + 1)}
            disabled={total <= 1}
            aria-label="다음 슬라이드"
          >
            <ChevronRightIcon size={24} />
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  if (!card) return null;

  const author = getStreamAuthor(card);
  const activeMediaIndex = Math.min(mediaIndex, Math.max(0, mediaItems.length - 1));
  const activeMediaItem = mediaItems[activeMediaIndex];
  const fileAttachments = (card.attachments ?? []).filter(
    (item) => item.kind === "file",
  );
  const hasContent = card.content.trim().length > 0;
  const linkUrl = card.linkUrl;
  const isYouTubeVideo = Boolean(linkUrl && extractVideoId(linkUrl));
  const isCanvaMedia = activeMediaItem?.kind === "canva";
  const hasFiles = Boolean(card.fileUrl) || fileAttachments.length > 0;
  const displayTitle = resolveSlideshowTitle(card, resolvedYouTubeTitle);

  function goMedia(next: number) {
    if (mediaItems.length <= 1) return;
    setMediaIndex((next + mediaItems.length) % mediaItems.length);
  }

  function revealControls() {
    setControlsVisible(true);
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsTimerRef.current = null;
    }, 900);
  }

  return createPortal(
    <div
      className={`slideshow-overlay ${
        controlsVisible ? "is-controls-visible" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="슬라이드쇼"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={revealControls}
    >
      <div className="slideshow-topbar">
        <div className="slideshow-meta">
          <span className="slideshow-meta-app">Aura Board</span>
          <span className="slideshow-meta-sep" aria-hidden="true">·</span>
          <span className="slideshow-meta-author">{author.displayName}</span>
          <time className="slideshow-meta-time">
            {formatRelativeTime(
              card.createdAt ?? new Date().toISOString(),
            )}
          </time>
        </div>
        <div className="slideshow-topbar-right">
          <span className="slideshow-position" aria-live="polite">
            {safeIndex + 1} / {total}
          </span>
          <button
            type="button"
            className="ui-icon-action slideshow-close"
            onClick={onClose}
            aria-label="슬라이드쇼 닫기"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      <div
        className={`slideshow-stage${isYouTubeVideo ? " slideshow-stage--youtube" : ""}${
          isCanvaMedia ? " slideshow-stage--canva" : ""
        }`}
      >
        <div className="slideshow-text">
          {!isYouTubeVideo && <h2 className="slideshow-title">{displayTitle}</h2>}
          {hasContent && <p className="slideshow-content">{card.content}</p>}

          {linkUrl && !isYouTubeVideo && (
            <a
              className="slideshow-link"
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span className="slideshow-link-host">
                {getHost(linkUrl)}
              </span>
              <strong>{card.linkTitle || linkUrl}</strong>
              {card.linkDesc && <span>{card.linkDesc}</span>}
            </a>
          )}

          {hasFiles && (
            <div className="slideshow-files">
              {card.fileUrl && (
                <div
                  className="slideshow-file"
                  title={card.fileName ?? undefined}
                >
                  <span className="slideshow-file-icon" aria-hidden="true">
                    파일
                  </span>
                  <span className="slideshow-file-name">
                    {card.fileName ?? "파일"}
                  </span>
                </div>
              )}
              {fileAttachments.map((file) => (
                <div
                  className="slideshow-file"
                  key={file.id}
                  title={file.fileName ?? undefined}
                >
                  <span className="slideshow-file-icon" aria-hidden="true">
                    파일
                  </span>
                  <span className="slideshow-file-name">
                    {file.fileName ?? "파일"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="slideshow-media">
          {activeMediaItem ? (
            <div className="slideshow-media-strip">
              <figure
                className={`slideshow-media-slide${
                  activeMediaItem.kind === "youtube"
                    ? " slideshow-media-slide--youtube"
                    : activeMediaItem.kind === "canva"
                      ? " slideshow-media-slide--canva"
                    : ""
                }`}
              >
                {activeMediaItem.kind === "image" ? (
                  <img
                    src={activeMediaItem.url}
                    alt={activeMediaItem.alt}
                    loading="lazy"
                    decoding="async"
                  />
                ) : activeMediaItem.kind === "youtube" || activeMediaItem.kind === "canva" ? (
                  <iframe
                    src={activeMediaItem.url}
                    title={activeMediaItem.alt}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={activeMediaItem.url}
                    poster={activeMediaItem.previewUrl ?? undefined}
                    controls
                    preload="metadata"
                    playsInline
                  />
                )}
                {activeMediaItem.kind === "youtube" && (
                  <figcaption className="slideshow-media-caption">
                    {displayTitle}
                  </figcaption>
                )}
              </figure>
              {mediaItems.length > 1 && (
                <>
                  <button
                    type="button"
                    className="slideshow-media-nav slideshow-media-prev"
                    onClick={() => goMedia(activeMediaIndex - 1)}
                    aria-label="이전 미디어"
                  >
                    <ChevronLeftIcon size={20} />
                  </button>
                  <button
                    type="button"
                    className="slideshow-media-nav slideshow-media-next"
                    onClick={() => goMedia(activeMediaIndex + 1)}
                    aria-label="다음 미디어"
                  >
                    <ChevronRightIcon size={20} />
                  </button>
                  <div
                    className="slideshow-media-indicators"
                    aria-label={`미디어 ${activeMediaIndex + 1} / ${mediaItems.length}`}
                  >
                    {mediaItems.map((item, i) => (
                      <button
                        key={item.id}
                        type="button"
                        className={i === activeMediaIndex ? "is-active" : ""}
                        aria-label={`${i + 1}번째 미디어 보기`}
                        aria-current={i === activeMediaIndex ? "true" : undefined}
                        onClick={() => setMediaIndex(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="slideshow-media-empty">
              <span>미디어가 없어요</span>
            </div>
          )}
        </div>
      </div>

      <div className="slideshow-controls">
        <button
          type="button"
          className="slideshow-nav slideshow-prev"
          onClick={() => go(safeIndex - 1)}
          disabled={total <= 1}
          aria-label="이전 슬라이드"
        >
          <ChevronLeftIcon size={24} />
        </button>
        <div className="slideshow-slide-indicators" aria-label={`슬라이드 ${safeIndex + 1} / ${total}`}>
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === safeIndex ? "is-active" : ""}
              aria-label={`${i + 1}번째 슬라이드 보기`}
              aria-current={i === safeIndex ? "true" : undefined}
              onClick={() => onIndexChange(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="slideshow-nav slideshow-next"
          onClick={() => go(safeIndex + 1)}
          disabled={total <= 1}
          aria-label="다음 슬라이드"
        >
          <ChevronRightIcon size={24} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Resolve a display title for the slideshow. Falls back to the first
 * non-empty content line, then to "제목 없음" when both are empty.
 */
function resolveSlideshowTitle(
  card: CardData,
  resolvedYouTubeTitle?: string | null,
): string {
  if (card.linkUrl && extractVideoId(card.linkUrl) && card.linkTitle?.trim()) {
    return card.linkTitle.trim();
  }
  if (card.linkUrl && extractVideoId(card.linkUrl) && resolvedYouTubeTitle) {
    return resolvedYouTubeTitle;
  }
  const trimmedTitle = card.title.trim();
  if (trimmedTitle) return trimmedTitle;
  const firstLine = card.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? "제목 없음";
}

/**
 * Build media items for a slide from the same card fields used by CardBody:
 * attachments first, then legacy imageUrl/videoUrl and link-preview fallback.
 */
function buildSlideshowMedia(card: CardData): MediaItem[] {
  const linkedYouTubeId = card.linkUrl ? extractVideoId(card.linkUrl) : null;
  if (linkedYouTubeId) {
    return [
      {
        id: `${card.id}-youtube`,
        kind: "youtube",
        url: `https://www.youtube.com/embed/${linkedYouTubeId}`,
        previewUrl: card.linkImage,
        alt: card.linkTitle ?? card.title ?? "YouTube",
      },
    ];
  }

  const linkedCanvaEmbedSrc = card.linkUrl ? buildCanvaEmbedSrc(card.linkUrl) : null;
  if (linkedCanvaEmbedSrc) {
    return [
      {
        id: `${card.id}-canva`,
        kind: "canva",
        url: linkedCanvaEmbedSrc,
        previewUrl: card.linkImage,
        alt: card.linkTitle ?? card.title ?? "Canva",
      },
    ];
  }

  const fromAttachments = (card.attachments ?? [])
    .filter((item) => item.kind === "image" || item.kind === "video")
    .map((item) => ({
      id: item.id,
      kind: item.kind as "image" | "video",
      url: item.url,
      previewUrl: item.previewUrl,
      alt: item.fileName ?? card.title,
    }));

  if (fromAttachments.length > 0) return fromAttachments;

  const legacy: MediaItem[] = [];
  if (card.imageUrl) {
    legacy.push({
      id: `${card.id}-image`,
      kind: "image",
      url: card.imageUrl,
      previewUrl: card.thumbUrl,
      alt: card.title,
    });
  }
  // Skip video when it's just a YouTube link URL (shown as link preview).
  if (
    card.videoUrl &&
    !(
      card.linkUrl &&
      card.videoUrl === card.linkUrl &&
      isYouTubeLink(card.linkUrl)
    )
  ) {
    legacy.push({
      id: `${card.id}-video`,
      kind: "video",
      url: card.videoUrl,
      previewUrl: card.thumbUrl,
      alt: card.title,
    });
  }
  if (legacy.length > 0) return legacy;

  // Fallback: link preview image as the visual media.
  if (card.linkImage) {
    return [
      {
        id: `${card.id}-link-image`,
        kind: "image",
        url: card.linkImage,
        previewUrl: null,
        alt: card.linkTitle ?? card.title,
      },
    ];
  }

  return [];
}

function getHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}
