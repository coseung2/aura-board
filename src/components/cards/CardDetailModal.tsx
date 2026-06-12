"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractVideoId } from "@/lib/youtube";
import {
  hasPrimaryNonLinkContent,
  isYouTubeChannelLink,
  isYouTubeLink,
  shouldPromoteLinkPreview,
} from "@/lib/card-content-policy";
import { CardAttachments } from "../CardAttachments";
import { CardAuthorFooter } from "./CardAuthorFooter";
import { CardImageLightbox } from "./CardImageLightbox";
import { CardEngagement } from "../engagement/CardEngagement";
import {
  CloseIcon,
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

  useEffect(() => {
    if (!card) return;
    function onKey(e: KeyboardEvent) {
      // 라이트박스 열려 있으면 카드 네비게이션 (좌우 화살표·ESC) 전부
      // 라이트박스에 위임. 여기선 무시.
      if (lightboxIndex !== null) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose, lightboxIndex]);

  useEffect(() => {
    if (!card) return;
    // F11/ESC로 fullscreen 빠져나와도 상태는 그대로. native fullscreenchange
    // via F11/ESC flips the button back without an extra click.
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

  // YouTube channel URLs render as a regular link preview (banner + name
  // + description), not an inline iframe. Suppress the "원본 링크 열기"
  // button on those cards the same way we do for any other link-preview
  // card — the preview itself is the link, an extra "open" button is
  // noise. (Canva keeps the button because its embed is an iframe and the
  // banner alone is not clickable to the design.)
  const isChannel = isYouTubeChannelLink(card.linkUrl);
  const showOriginalLink =
    Boolean(card.linkUrl && !extractVideoId(card.linkUrl) && !isChannel);
  const policyInput = {
    imageUrl: card.imageUrl,
    linkUrl: card.linkUrl,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    attachments: card.attachments,
  };
  const hasNonLinkMedia = hasPrimaryNonLinkContent(policyInput);
  const shouldShowLinkAsMedia = shouldPromoteLinkPreview(policyInput);
  const shouldPassLinkToMedia = shouldShowLinkAsMedia || isYouTubeLink(card.linkUrl);
  const hasLinkPreview = Boolean(
    card.linkUrl && (card.linkImage || card.linkTitle || card.linkDesc)
  );
  const hasMedia = hasNonLinkMedia || shouldShowLinkAsMedia || hasLinkPreview;

  // 본문 카드 안의 모든 텍스트 요소를 동일한 폰트 크기/줄높이로 통일
  // (Variant C 스타일 슬라이드 + 본문 정돈).
  const slideTitleSize = "clamp(20px, 2.4vw, 28px)";
  const slideBodySize = "15px";

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
        <div className="card-detail-body">
          {hasMedia && (
            <section className="card-detail-media" aria-label="첨부">
              <CardAttachments
                imageUrl={card.imageUrl}
                thumbUrl={card.thumbUrl}
                linkUrl={shouldPassLinkToMedia || hasLinkPreview ? card.linkUrl : null}
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
              {showOriginalLink && card.linkUrl && (
                <a
                  href={card.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-detail-media-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  🔗 링크 열기
                </a>
              )}
            </section>
          )}
          <aside className="card-detail-side">
            <div className="card-detail-side-inner">
              {card.title.trim() && (
                <h2
                  className="card-detail-title"
                  style={{ fontSize: slideTitleSize, lineHeight: 1.3 }}
                >
                  {card.title}
                </h2>
              )}
              {card.content && (
                <p
                  className="card-detail-content"
                  style={{ fontSize: slideBodySize, lineHeight: 1.7 }}
                >
                  {card.content}
                </p>
              )}
              {!hasMedia && showOriginalLink && card.linkUrl && (
                <a
                  href={card.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-detail-link"
                >
                  🔗 링크 열기
                </a>
              )}
              <div className="card-detail-meta">
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
              </div>
              {/* card-detail-modal-engagement (2026-04-26): 좋아요 + 댓글 패널.
                  작성자 지정 버튼 바로 아래 배치. */}
              <CardEngagement cardId={card.id} mode="panel" />
            </div>
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
