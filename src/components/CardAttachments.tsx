"use client";

import { memo } from "react";
import { extractCanvaDesignId, hasCanvaShareToken } from "@/lib/canva";
import { extractVideoId } from "@/lib/youtube";
import { CanvaEmbedSlot } from "./CanvaEmbedSlot";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { CardFileAttachment } from "./CardFileAttachment";
import { LinkPreviewImage } from "./cards/LinkPreviewImage";

function getYouTubeId(url: string): string | null {
  return extractVideoId(url);
}

type AttachmentItem = {
  id: string;
  kind: string;
  url: string;
  previewUrl?: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  order: number;
};

type Props = {
  imageUrl?: string | null;
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDesc?: string | null;
  linkImage?: string | null;
  videoUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  /** multi-attachment (2026-04-20): 정규화 첨부 배열. 있으면 이 배열이
   *  우선 렌더되고, 비어있을 때만 위의 single-field fallback이 동작. */
  attachments?: AttachmentItem[];
  /** 썸네일 모드 — 첫 첨부만 렌더 + 2개 이상이면 "+N" 배지. 기본은 detail
   *  (모달용, 전부 렌더). 카드 본문에서는 "thumbnail" 로 지정. */
  variant?: "thumbnail" | "detail";
  /** detail 모드에서 이미지 클릭 시 라이트박스 오픈. index 는 이미지
   *  속성만 걸러낸 배열 기준 (pdf/video 등 제외). */
  onImageClick?: (imageIndex: number) => void;
};

// All props are primitives/null, so default shallow equality is safe.
// Memoizing avoids re-rendering attachment previews on every unrelated
// parent state update (drag, selection, modal toggles, etc.).
export const CardAttachments = memo(function CardAttachments({ imageUrl, linkUrl, linkTitle, linkDesc, linkImage, videoUrl, fileUrl, fileName, fileSize, fileMimeType, attachments, variant = "detail", onImageClick }: Props) {
  const hasAttachments = (attachments?.length ?? 0) > 0;
  if (!hasAttachments && !imageUrl && !linkUrl && !videoUrl && !fileUrl) return null;

  // 링크는 attachments에 포함되지 않으므로 별개 렌더. multi-attachment
  // 카드에서도 링크는 최대 1개(현 스키마 제약).
  const canvaDesignId = linkUrl ? extractCanvaDesignId(linkUrl) : null;
  const hasShareToken = Boolean(linkUrl && hasCanvaShareToken(linkUrl));
  const canRenderCanvaEmbed = Boolean(canvaDesignId && (linkImage || hasShareToken));
  const linkYouTubeId = linkUrl ? getYouTubeId(linkUrl) : null;
  const effectiveVideoUrl = videoUrl ?? (linkYouTubeId ? linkUrl : null);
  const shouldHideLinkPreview = Boolean(linkYouTubeId);

  // multi-attachment: 링크·canva·youtube는 기존 로직 그대로, 나머지
  // 이미지/동영상/파일은 attachments 배열을 우선 렌더.
  const allSorted = hasAttachments
    ? [...(attachments ?? [])].sort((a, b) => a.order - b.order)
    : [];
  // 썸네일 모드: 첫 첨부만. 모달 모드: 전부.
  const sorted = variant === "thumbnail" ? allSorted.slice(0, 1) : allSorted;
  const extraCount = variant === "thumbnail" ? Math.max(0, allSorted.length - 1) : 0;

  // detail 모드에서 이미지 클릭 시 라이트박스를 띄울 수 있도록 인덱스 계산.
  // 이미지 종류만 navigation 대상 (pdf/video 제외). CardDetailModal 이
  // onImageClick 을 넘기면 그 안에서 라이트박스 state 를 관리.
  const imageAttachments = sorted.filter((a) => a.kind === "image");
  const renderVideoPoster = (key: string, extraBadge = true) => (
    <div key={key} className="card-attach-video card-attach-media-poster">
      <div className="card-attach-video-placeholder" aria-hidden="true" />
      <span className="card-canva-slot-play-icon" aria-hidden="true">
        ▶
      </span>
      {extraBadge && extraCount > 0 && (
        <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
          +{extraCount}
        </span>
      )}
    </div>
  );

  return (
    <div className="card-attachments">
      {hasAttachments
        ? sorted.map((a) => {
            if (a.kind === "image") {
              const imageSrc = variant === "thumbnail" ? a.previewUrl ?? a.url : a.url;
              if (variant === "detail") {
                // 모달 내 이미지는 원본 비율/해상도 보존. OptimizedImage 의
                // fill 모드는 컨테이너 높이 문제로 크롭처럼 보여서 plain <img>
                // 로 직접 렌더. 클릭 시 라이트박스 오픈 콜백.
                const imgIdx = imageAttachments.findIndex((it) => it.id === a.id);
                const clickable = !!onImageClick;
                return (
                  <div key={a.id} className="card-attach-image is-detail">
                    <img
                      src={imageSrc}
                      alt={a.fileName ?? ""}
                      loading="lazy"
                      decoding="async"
                      className={clickable ? "is-clickable" : undefined}
                      onClick={
                        clickable ? () => onImageClick!(imgIdx) : undefined
                      }
                    />
                    {extraCount > 0 && (
                      <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
                        +{extraCount}
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <div key={a.id} className="card-attach-image optimized-img-wrap">
                  <OptimizedImage
                    src={imageSrc}
                    alt={a.fileName ?? ""}
                    sizes="(max-width: 768px) 100vw, 480px"
                  />
                  {extraCount > 0 && (
                    <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
                      +{extraCount}
                    </span>
                  )}
                </div>
              );
            }
            if (a.kind === "video") {
              if (variant === "thumbnail") {
                return renderVideoPoster(a.id);
              }
              const yt = getYouTubeId(a.url);
              if (yt) {
                return (
                  <div key={a.id} className="card-attach-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${yt}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="YouTube"
                    />
                    {extraCount > 0 && (
                      <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
                        +{extraCount}
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <div key={a.id} className="card-attach-video">
                  <video src={a.url} controls preload="metadata" />
                  {extraCount > 0 && (
                    <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
                      +{extraCount}
                    </span>
                  )}
                </div>
              );
            }
            // file
            return (
              <div key={a.id} className="card-attach-file-wrap">
                <CardFileAttachment
                  fileUrl={a.url}
                  fileName={a.fileName}
                  fileSize={a.fileSize}
                  fileMimeType={a.mimeType}
                />
                {extraCount > 0 && (
                  <span className="card-attach-multi-badge is-inline" aria-label={`+${extraCount}개 더`}>
                    +{extraCount}
                  </span>
                )}
              </div>
            );
          })
        : (
          <>
            {imageUrl && (
              <div className="card-attach-image optimized-img-wrap">
                <OptimizedImage
                  src={imageUrl}
                  alt=""
                  sizes="(max-width: 768px) 100vw, 480px"
                />
              </div>
            )}
            {effectiveVideoUrl && (() => {
              if (variant === "thumbnail") {
                return renderVideoPoster("single-video", false);
              }
              const yt = getYouTubeId(effectiveVideoUrl);
              return yt ? (
                <div className="card-attach-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${yt}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="YouTube"
                  />
                </div>
              ) : (
                <div className="card-attach-video">
                  <video src={effectiveVideoUrl} controls preload="metadata" />
                </div>
              );
            })()}
            {fileUrl && (
              <CardFileAttachment
                fileUrl={fileUrl}
                fileName={fileName ?? null}
                fileSize={fileSize ?? null}
                fileMimeType={fileMimeType ?? null}
              />
            )}
          </>
        )}
      {linkUrl && canRenderCanvaEmbed && canvaDesignId ? (
        // Delegated to CanvaEmbedSlot (T0-② virtualization): thumbnail by
        // default, iframe mounts only on activation + in viewport, with a
        // global LRU-3 budget. key={designId} forces full remount when the
        // card's design changes so the slot's internal load state resets.
        <CanvaEmbedSlot
          key={canvaDesignId}
          designId={canvaDesignId}
          linkUrl={linkUrl}
          linkTitle={linkTitle ?? null}
          linkImage={linkImage ?? null}
          linkDesc={linkDesc ?? null}
        />
      ) : linkUrl && !shouldHideLinkPreview ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`card-link-preview ${linkImage ? "has-image" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {linkImage && (
            <LinkPreviewImage
              src={linkImage}
              sizes="(max-width: 768px) 100vw, 480px"
            />
          )}
          <div className="card-link-preview-body">
            <span className="card-link-preview-title">
              {linkTitle || (() => {
                try { return new URL(linkUrl).hostname.replace(/^www\./, ""); }
                catch { return linkUrl; }
              })()}
            </span>
            {linkDesc && (
              <span className="card-link-preview-desc">{linkDesc}</span>
            )}
            <span className="card-link-preview-url">
              🔗 {(() => {
                try { return new URL(linkUrl).hostname.replace(/^www\./, ""); }
                catch { return linkUrl; }
              })()}
            </span>
          </div>
        </a>
      ) : null}
    </div>
  );
});

// NOTE: Legacy inline CanvaEmbed has been replaced by the virtualized
// CanvaEmbedSlot in ./CanvaEmbedSlot.tsx (T0-② tablet-crash mitigation).
// OptimizedImage (T0-④) is used for thumbnails and link previews above.
