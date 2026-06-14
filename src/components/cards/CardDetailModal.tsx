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
import { CardFileAttachment } from "../CardFileAttachment";
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
  const policyInput = {
    imageUrl: card.imageUrl,
    linkUrl: card.linkUrl,
    videoUrl: card.videoUrl,
    fileUrl: card.fileUrl,
    attachments: card.attachments,
  };
  // text-only 모달 분기 (2026-06-14): hasMedia = image/video/youtube만.
  // linkUrl은 본문 영역에서 텍스트 2줄로 표시 (media 영역으로 안 보냄).
  // hasBodyContent: 본문/파일/링크 텍스트가 본문 영역에 있을지 여부.
  // 없으면 media-only 모달(content-zone hide)로 분기.
  const hasUploadedImageOrVideo = Boolean(
    card.imageUrl ||
      card.videoUrl ||
      isYouTubeLink(card.linkUrl) ||
      (card.attachments ?? []).some(
        (a) => a.kind === "image" || a.kind === "video"
      )
  );
  const hasMedia = hasUploadedImageOrVideo;
  const hasBodyContent = Boolean(
    card.title.trim() ||
      (card.content && card.content.trim()) ||
      card.fileUrl ||
      (card.attachments ?? []).some((a) => a.kind === "file") ||
      card.linkUrl
  );

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
        data-has-body={hasBodyContent ? "true" : "false"}
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
          <section className="card-detail-main" aria-label="콘텐츠">
            {hasMedia && (
              <div className="card-detail-media" aria-label="첨부">
                <CardAttachments
                  imageUrl={card.imageUrl}
                  thumbUrl={card.thumbUrl}
                  linkUrl={null}
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
              </div>
            )}
            {hasBodyContent && (
              <div className="card-detail-content-zone">
              {/* meta-download-zone (2026-06-13): 본문 = 제목 + content +
                  linkTitle/linkDesc (Notion 스타일 — 굵은 제목 / 한 줄 빈 줄 /
                  설명). 텍스트만 본문 영역. 파일 첨부는 본문 아래 다운로드
                  리스트. */}
              <div className="card-detail-body-text">
                {card.title.trim() && (
                  <h2
                    className="card-detail-title"
                    style={{ fontSize: slideTitleSize, lineHeight: 1.3, margin: 0 }}
                  >
                    {card.title}
                  </h2>
                )}
                {(card.linkTitle || card.linkDesc) && (
                  <div
                    className="card-detail-link-body"
                    style={{ fontSize: slideBodySize, lineHeight: 1.7 }}
                  >
                    {card.linkTitle && (
                      <strong className="card-detail-link-title">{card.linkTitle}</strong>
                    )}
                    {card.linkTitle && card.linkDesc && (
                      <div className="card-detail-link-spacer" aria-hidden="true" />
                    )}
                    {card.linkDesc && (
                      <span className="card-detail-link-desc">{card.linkDesc}</span>
                    )}
                  </div>
                )}
                {card.content && (
                  <CardBodyContent
                    content={card.content}
                    bodyFontSize={slideBodySize}
                  />
                )}
              </div>
              {/* meta-download-zone (2026-06-13): 파일 첨부 다운로드 리스트.
                  legacy fileUrl/fileName/fileSize/fileMimeType + attachments[].kind==="file"
                  둘 다 커버. */}
              {(card.fileUrl ||
                (card.attachments ?? []).some((a) => a.kind === "file")) && (
                <ul className="card-detail-file-list" aria-label="첨부 파일">
                  {/* key dedup (2026-06-13): legacy card.fileUrl과 attachments[]
                      양쪽에 같은 url이 동기화된 경우 동일 row가 두 번 렌더되어
                      React key 충돌 경고 발생. legacy가 있으면 그 url과 같은
                      첨부는 제외. */}
                  {card.fileUrl && (
                    <li
                      key={`legacy-file-${card.fileUrl}`}
                      className="card-detail-file-item"
                    >
                      <CardFileAttachment
                        fileUrl={card.fileUrl}
                        fileName={card.fileName ?? null}
                        fileSize={card.fileSize ?? null}
                        fileMimeType={card.fileMimeType ?? null}
                      />
                    </li>
                  )}
                  {(card.attachments ?? [])
                    .filter(
                      (a) =>
                        a.kind === "file" &&
                        !(card.fileUrl && a.url === card.fileUrl)
                    )
                    .sort((a, b) => a.order - b.order)
                    .map((a) => (
                      <li key={a.id} className="card-detail-file-item">
                        <CardFileAttachment
                          fileUrl={a.url}
                          fileName={a.fileName ?? null}
                          fileSize={a.fileSize ?? null}
                          fileMimeType={a.mimeType ?? null}
                        />
                      </li>
                    ))}
                </ul>
              )}
              {!hasMedia && card.linkUrl && (
                <a
                  href={card.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-detail-link"
                >
                  🔗 링크 열기
                </a>
              )}
            </div>
            )}
          </section>
          <aside className="card-detail-rail" aria-label="메타 및 인터랙션">
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
            {/* card-detail-modal-engagement (2026-04-26): 좋아요 + 댓글 패널. */}
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

// meta-download-zone (2026-06-13): 본문(content)을 Notion 스타일로 렌더.
// 첫 줄이 "**...**"로 시작/끝나면 굵은 제목으로 분리, 그 다음 빈 줄 한 줄,
// 그 다음 본문 텍스트. 사용자가 직접 마크다운을 쓰지 않는 한 이 형식이
// 안전. (linkTitle/linkDesc 자동 append가 항상 이 형식으로 넣음)
function CardBodyContent({
  content,
  bodyFontSize,
}: {
  content: string;
  bodyFontSize: string;
}) {
  const match = content.match(/^\s*\*\*(.+?)\*\*\s*\n\n?([\s\S]*)$/);
  if (match) {
    const [, title, rest] = match;
    return (
      <>
        <h3
          className="card-detail-content-title"
          style={{ fontSize: bodyFontSize, lineHeight: 1.5, margin: 0, fontWeight: 700 }}
        >
          {title}
        </h3>
        {rest.trim() && (
          <p
            className="card-detail-content"
            style={{ fontSize: bodyFontSize, lineHeight: 1.7, margin: 0 }}
          >
            {rest}
          </p>
        )}
      </>
    );
  }
  return (
    <p
      className="card-detail-content"
      style={{ fontSize: bodyFontSize, lineHeight: 1.7, margin: 0 }}
    >
      {content}
    </p>
  );
}
