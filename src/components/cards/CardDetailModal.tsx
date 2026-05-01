"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractVideoId } from "@/lib/youtube";
import { CardAttachments } from "../CardAttachments";
import { CardAuthorFooter } from "./CardAuthorFooter";
import { CardImageLightbox } from "./CardImageLightbox";
import { CardEngagement } from "../engagement/CardEngagement";
import {
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FullscreenEnterIcon,
  FullscreenExitIcon,
} from "../icons/UiIcons";
import type { CardData } from "../DraggableCard";

type Props = {
  card: CardData | null;
  onClose: () => void;
  /** Optional: cards list + setter for prev/next navigation. */
  cards?: CardData[];
  onChange?: (card: CardData) => void;
  /** Opens CardAuthorEditor from inside the modal. When undefined the
   *  button is hidden. When defined, visibility is further gated by
   *  `canEditAuthors` (per-card predicate) if provided. */
  onEditAuthors?: (card: CardData) => void;
  /** Per-card gate — when set, the button only renders for cards that
   *  return `true`. Lets teachers (all cards) and students (own cards)
   *  share the same modal without leaking the editor to peers. */
  canEditAuthors?: (card: CardData) => boolean;
};

export function CardDetailModal({
  card,
  onClose,
  cards,
  onChange,
  onEditAuthors,
  canEditAuthors,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 카드 내부 이미지 라이트박스. null 이면 닫힘. 값은 card.attachments 중
  // kind==="image" 만 걸러낸 배열 내 인덱스.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 카드가 바뀌면 라이트박스 자동 닫기 (카드 간 이동은 라이트박스의 scope 밖).
  useEffect(() => {
    setLightboxIndex(null);
  }, [card?.id]);

  const navIndex = useMemo(() => {
    if (!card || !cards || cards.length === 0) return -1;
    return cards.findIndex((c) => c.id === card.id);
  }, [card, cards]);

  const goPrev = useCallback(() => {
    if (!cards || navIndex < 0) return;
    const next = cards[(navIndex - 1 + cards.length) % cards.length];
    if (next) onChange?.(next);
  }, [cards, navIndex, onChange]);

  const goNext = useCallback(() => {
    if (!cards || navIndex < 0) return;
    const next = cards[(navIndex + 1) % cards.length];
    if (next) onChange?.(next);
  }, [cards, navIndex, onChange]);

  useEffect(() => {
    if (!card) return;
    function onKey(e: KeyboardEvent) {
      // 라이트박스 열려 있으면 카드 네비게이션 (좌우 화살표·ESC) 전부
      // 라이트박스에 위임. 여기선 무시.
      if (lightboxIndex !== null) return;
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [card, onClose, goPrev, goNext, lightboxIndex]);

  // Sync local state with the browser's fullscreen lifecycle so exiting
  // via F11/ESC flips the button back without an extra click.
  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Some browsers block fullscreen without user activation; no-op.
    }
  }, []);

  if (!card) return null;

  const showOriginalLink = Boolean(card.linkUrl && !extractVideoId(card.linkUrl));
  const hasMedia =
    Boolean(card.imageUrl) ||
    Boolean(card.linkImage) ||
    Boolean(card.videoUrl) ||
    Boolean(card.linkUrl) ||
    Boolean(card.fileUrl) ||
    (card.attachments?.length ?? 0) > 0;

  return (
    <>
      {!isFullscreen && (
        <div className="modal-backdrop" onClick={onClose} />
      )}
      <div
        ref={rootRef}
        className="add-card-modal card-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
        data-has-media={hasMedia ? "true" : "false"}
        data-fullscreen={isFullscreen ? "true" : "false"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close card-detail-close"
          onClick={onClose}
          aria-label="닫기"
        >
          <CloseIcon size={18} />
        </button>
        <button
          type="button"
          className="card-detail-fullscreen"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "전체화면 끄기" : "전체화면 켜기"}
          title={isFullscreen ? "전체화면 끄기" : "전체화면으로 발표"}
        >
          {isFullscreen ? <FullscreenExitIcon size={20} /> : <FullscreenEnterIcon size={20} />}
        </button>
        {cards && cards.length > 1 && navIndex >= 0 && (
          <>
            <button
              type="button"
              className="card-detail-nav card-detail-nav-prev"
              onClick={goPrev}
              aria-label="이전 카드"
            >
              <ChevronLeftIcon size={24} />
            </button>
            <button
              type="button"
              className="card-detail-nav card-detail-nav-next"
              onClick={goNext}
              aria-label="다음 카드"
            >
              <ChevronRightIcon size={24} />
            </button>
          </>
        )}
        <div className="card-detail-body">
          {hasMedia && (
            <section className="card-detail-media" aria-label="첨부">
              <CardAttachments
                imageUrl={card.imageUrl}
                linkUrl={card.linkUrl}
                linkTitle={card.linkTitle}
                linkDesc={card.linkDesc}
                linkImage={card.linkImage}
                videoUrl={card.videoUrl}
                fileUrl={card.fileUrl}
                fileName={card.fileName}
                fileSize={card.fileSize}
                fileMimeType={card.fileMimeType}
                attachments={card.attachments}
                onImageClick={(i) => setLightboxIndex(i)}
              />
            </section>
          )}
          <aside className="card-detail-side">
            <h2 className="card-detail-title">{card.title}</h2>
            {card.content && (
              <p className="card-detail-content">{card.content}</p>
            )}
            {showOriginalLink && card.linkUrl && (
              <a
                href={card.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="card-detail-link"
              >
                🔗 원본 열기
              </a>
            )}
            <CardAuthorFooter
              authors={card.authors}
              externalAuthorName={card.externalAuthorName}
              studentAuthorName={card.studentAuthorName}
              authorName={card.authorName}
              createdAt={card.createdAt}
              anonymousAuthor={card.anonymousAuthor}
            />
            {onEditAuthors && (canEditAuthors ? canEditAuthors(card) : true) && (
              <button
                type="button"
                className="card-detail-edit-authors"
                onClick={() => onEditAuthors(card)}
              >
                👥 작성자 지정
              </button>
            )}
            {/* card-detail-modal-engagement (2026-04-26): 좋아요 + 댓글 패널.
                작성자 지정 버튼 바로 아래 배치. */}
            <CardEngagement cardId={card.id} mode="panel" />
          </aside>
        </div>
        {lightboxIndex !== null &&
          (() => {
            const imageItems = (card.attachments ?? [])
              .filter((a) => a.kind === "image")
              .sort((a, b) => a.order - b.order)
              .map((a) => ({ id: a.id, url: a.url, alt: a.fileName ?? "" }));
            if (imageItems.length === 0) return null;
            return (
              <CardImageLightbox
                images={imageItems}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            );
          })()}
      </div>
    </>
  );
}
