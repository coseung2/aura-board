"use client";

import { memo, useEffect, useState } from "react";
import { extractCanvaDesignId } from "@/lib/canva-url";
import { extractVideoId } from "@/lib/youtube";
import { shouldPromoteLinkPreview } from "@/lib/card-content-policy";
import { fileMimeToIcon, fileMimeToLabel, formatBytes } from "@/lib/file-attachment";
import { CanvaEmbedSlot } from "./CanvaEmbedSlot";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { CardFileAttachment } from "./CardFileAttachment";
import { LinkPreviewImage } from "./cards/LinkPreviewImage";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "./icons/UiIcons";

function getYouTubeId(url: string): string | null {
  return extractVideoId(url);
}

function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function hasSameYouTubeId(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const aId = getYouTubeId(a);
  const bId = getYouTubeId(b);
  return Boolean(aId && bId && aId === bId);
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
  thumbUrl?: string | null;
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
  /** 썸네일 모드 - 첫 첨부만 렌더 + 2개 이상이면 "+N" 배지. 기본은 detail
   *  (모달용, 전부 렌더). 카드 본문에서는 "thumbnail" 로 지정. */
  variant?: "thumbnail" | "detail";
  /** detail 모드에서 이미지 클릭 시 라이트박스 오픈. index 는 이미지
   *  속성만 걸러낸 배열 기준 (pdf/video 등 제외). */
  onImageClick?: (imageIndex: number) => void;
};

// All props are primitives/null, so default shallow equality is safe.
// Memoizing avoids re-rendering attachment previews on every unrelated
// parent state update (drag, selection, modal toggles, etc.).
export const CardAttachments = memo(function CardAttachments({ imageUrl, thumbUrl, linkUrl, linkTitle, linkDesc, linkImage, videoUrl, fileUrl, fileName, fileSize, fileMimeType, attachments, variant = "detail", onImageClick }: Props) {
  const [playedVideoIds, setPlayedVideoIds] = useState<Set<string>>(new Set());
  // media-attach-carousel (2026-06-12): detail 모드에서 media 항목이 2개
  // 이상이면 슬라이드 + 인디케이터로 전환. 단일 항목은 기존 표시 유지.
  const [mediaIndex, setMediaIndex] = useState(0);
  const allSorted = buildMediaItems({
    attachments,
    imageUrl,
    thumbUrl,
    videoUrl,
    fileUrl,
    fileName,
    fileSize,
    fileMimeType,
  });
  const hasAttachments = allSorted.length > 0;
  // 링크는 attachments에 포함되지 않으므로 별개 렌더. multi-attachment
  // 카드에서도 링크는 최대 1개(현 스키마 제약).
  const canvaDesignId = linkUrl ? extractCanvaDesignId(linkUrl) : null;
  const linkYouTubeId = linkUrl ? getYouTubeId(linkUrl) : null;
  const effectiveVideoUrl = videoUrl ?? (linkYouTubeId ? linkUrl : null);
  const shouldHideLinkPreview = Boolean(linkYouTubeId);
  const shouldPromoteLink = shouldPromoteLinkPreview({
    imageUrl,
    linkUrl,
    videoUrl,
    fileUrl,
    attachments,
  });
  const canRenderCanvaEmbed = Boolean(canvaDesignId);
  const hasLinkPreviewContent = Boolean(canRenderCanvaEmbed || linkImage || linkTitle || linkDesc);
  const shouldRenderDetailLinkPreview = Boolean(
    variant === "detail" &&
      linkUrl &&
      !shouldHideLinkPreview &&
      hasLinkPreviewContent
  );
  const shouldRenderThumbnailLinkPreview = Boolean(
    variant === "thumbnail" &&
      linkUrl &&
      !hasAttachments &&
      shouldPromoteLink &&
      !shouldHideLinkPreview
  );
  const linkedYouTubeAlreadyInMedia = Boolean(
    linkUrl &&
      linkYouTubeId &&
      ((!hasAttachments && effectiveVideoUrl === linkUrl) ||
        hasSameYouTubeId(videoUrl, linkUrl) ||
        allSorted.some(
          (item) => item.kind === "video" && hasSameYouTubeId(item.url, linkUrl)
        ))
  );
  const linkCountsAsAdditionalMedia = Boolean(
    linkUrl &&
      (linkYouTubeId ? !linkedYouTubeAlreadyInMedia : true) &&
      (hasAttachments || variant === "detail" || shouldRenderThumbnailLinkPreview)
  );

  const linkRendersAsMedia = Boolean(
    linkUrl &&
      ((variant === "thumbnail" && linkCountsAsAdditionalMedia) ||
        (linkYouTubeId && !linkedYouTubeAlreadyInMedia) ||
        (!shouldHideLinkPreview &&
          (variant === "detail" ? hasLinkPreviewContent : shouldRenderThumbnailLinkPreview)))
  );
  // multi-link-attach (2026-06-13): legacy linkUrl 단일 필드도
  // buildMediaItems()에서 kind:"link" 첨부로 자동 변환되므로, 별도 가상
  // 아이템 합치기 불필요. carousel은 attachments+legacy 합쳐진 allSorted로
  // 그대로 동작.
  // meta-download-zone (2026-06-13): file 첨부는 미디어 영역이 아니라
  // 메타 영역(우측 사이드)에 다운로드 리스트로 옮김. mediaSorted는
  // image/video/link만 포함하고, fileAttachments는 별도 export.
  const fileAttachments = allSorted.filter((a) => a.kind === "file");
  const mediaSorted = allSorted.filter((a) => a.kind !== "file");
  const allSortedWithLink = mediaSorted;
  const thumbnailItem = pickThumbnailItem(mediaSorted);
  const thumbnailFileItem =
    variant === "thumbnail" && !thumbnailItem ? fileAttachments[0] ?? null : null;
  const sorted =
    variant === "thumbnail"
      ? thumbnailItem
        ? [thumbnailItem]
        : thumbnailFileItem
          ? [thumbnailFileItem]
          : []
      : allSortedWithLink;
  // media-attach-carousel (2026-06-12): detail 모드 + 항목 ≥ 2 일 때만
  // 슬라이드 활성화. 단일 항목은 기존 풀 표시 유지.
  const isCarousel = variant === "detail" && sorted.length > 1;
  const currentItem = isCarousel ? sorted[Math.min(mediaIndex, sorted.length - 1)] : null;
  const extraCount =
    variant === "thumbnail"
      ? Math.max(
          0,
          mediaSorted.length +
            fileAttachments.length -
            (thumbnailItem || thumbnailFileItem ? 1 : 0) +
            (linkRendersAsMedia ? 1 : 0)
        )
      : 0;

  // detail 모드에서 이미지 클릭 시 라이트박스를 띄울 수 있도록 인덱스 계산.
  // 이미지 종류만 navigation 대상 (pdf/video 제외). CardDetailModal 이
  // onImageClick 을 넘기면 그 안에서 라이트박스 state 를 관리.
  const imageAttachments = sorted.filter((a) => a.kind === "image");
  // media-attach-carousel (2026-06-12): 항목이 바뀌면 mediaIndex를 안전
  // 범위로 클램프. 카드 전환 시 첨부 id 순서가 바뀌어 인덱스가 무효화될
  // 수 있어 useEffect로 동기화.
  useEffect(() => {
    if (mediaSorted.length === 0) {
      setMediaIndex(0);
      return;
    }
    setMediaIndex((i) => (i >= mediaSorted.length ? 0 : i));
  }, [mediaSorted.length]);
  // meta-download-zone (2026-06-13): detail 모드에서 file 첨부는 미디어
  // 영역이 아니라 메타 영역 다운로드 리스트로 옮김. thumbnail 모드에서는
  // file-only 카드도 카드 목록에서 첨부 신호가 보이도록 파일 타일을 렌더.
  if (!allSortedWithLink.length && !linkUrl && !thumbnailFileItem) return null;
  const renderVideoPoster = (
    key: string,
    videoUrlForFallback: string | null,
    posterUrl?: string | null,
    extraBadge = true,
    source: "youtube" | "upload" = "upload",
    onClick?: () => void,
  ) => (
    <div
      key={key}
      className={`card-attach-video card-attach-media-poster card-attach-media-poster-${source}${onClick ? " is-clickable" : ""}`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClick(); } } : undefined}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="card-attach-video-poster-img"
        />
      ) : videoUrlForFallback ? (
        <video
          src={videoUrlForFallback}
          preload="metadata"
          muted
          playsInline
          className="card-attach-video-poster-img"
        />
      ) : (
        <div className="card-attach-video-placeholder" aria-hidden="true" />
      )}
      {source === "youtube" && onClick ? (
        <span className="card-attach-youtube-play" aria-hidden="true">
          <PlayIcon size={18} />
        </span>
      ) : source !== "youtube" ? (
        <span className="card-attach-video-play" aria-hidden="true">
          <PlayIcon size={20} />
        </span>
      ) : null}
      {extraBadge && extraCount > 0 && (
        <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
          +{extraCount}
        </span>
      )}
    </div>
  );

  // media-attach-carousel (2026-06-12): 단일 미디어 항목 렌더 함수.
  // carousel/stacked 분기에서 공통 사용. 기존 map() 콜백을 그대로 추출.
  const renderMediaItem = (a: AttachmentItem) => {
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
        const yt = getYouTubeId(a.url);
        if (yt && playedVideoIds.has(a.id)) {
          return (
            <div key={a.id} className="card-attach-video">
              <iframe
                src={`https://www.youtube.com/embed/${yt}?autoplay=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="YouTube"
              />
            </div>
          );
        }
        const poster = renderVideoPoster(
          a.id,
          yt ? null : a.url,
          a.previewUrl ?? (yt ? getYouTubeThumbnailUrl(yt) : null),
          true,
          yt ? "youtube" : "upload",
          yt ? () => setPlayedVideoIds((prev) => new Set(prev).add(a.id)) : undefined,
        );
        return poster;
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
          <video src={a.url} controls preload="metadata" poster={a.previewUrl ?? undefined} />
          {extraCount > 0 && (
            <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
              +{extraCount}
            </span>
          )}
        </div>
      );
    }
    if (a.kind === "link") {
      const canvaAttachmentDesignId = extractCanvaDesignId(a.url);
      if (canvaAttachmentDesignId) {
        return (
          <CanvaEmbedSlot
            key={a.id}
            designId={canvaAttachmentDesignId}
            linkUrl={a.url}
            linkTitle={a.fileName ?? null}
            linkImage={a.previewUrl ?? null}
            linkDesc={a.mimeType ?? null}
          />
        );
      }
      // multi-link-attach (2026-06-13): link 첨부는 OG 카드(link-preview)
      // 로 표시. YouTube URL이라도 link kind면 OG 카드로 표시 - 재생이
      // 필요하면 video 첨부로 올리면 됨.
      return (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`card-link-preview ${a.previewUrl ? "has-image" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {a.previewUrl && (
            <LinkPreviewImage
              src={a.previewUrl}
              sizes="(max-width: 768px) 100vw, 480px"
            />
          )}
          <div className="card-link-preview-body">
            <span className="card-link-preview-title">
              {a.fileName || (() => {
                try { return new URL(a.url).hostname.replace(/^www\./, ""); }
                catch { return a.url; }
              })()}
            </span>
            <span className="card-link-preview-url">
              🔗 {(() => {
                try { return new URL(a.url).hostname.replace(/^www\./, ""); }
                catch { return a.url; }
              })()}
            </span>
            {a.mimeType && (
              <span className="card-link-preview-desc">{a.mimeType}</span>
            )}
          </div>
        </a>
      );
    }
    // file
    if (variant === "thumbnail") {
      const icon = fileMimeToIcon(a.mimeType ?? "");
      const label = fileMimeToLabel(a.mimeType ?? "");
      return (
        <div key={a.id} className="card-attach-file-thumbnail">
          <div className="card-attach-file-thumbnail-icon" aria-hidden>
            {icon}
          </div>
          <div className="card-attach-file-thumbnail-body">
            <span className="card-attach-file-thumbnail-name" title={a.fileName ?? "파일"}>
              {a.fileName ?? "파일"}
            </span>
            <span className="card-attach-file-thumbnail-meta">
              {a.fileSize ? formatBytes(a.fileSize) : "-"} · {label}
            </span>
          </div>
          {extraCount > 0 && (
            <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>
              +{extraCount}
            </span>
          )}
        </div>
      );
    }
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
  };

  return (
    <div className="card-attachments">
      {hasAttachments ? (
        // media-attach-carousel (2026-06-12): 슬라이드 모드면 현재 항목
        // 1개만, viewport 안에 콘텐츠 + arrow + indicator 모두 함께 렌더.
        // arrow는 박스 없이 글리프만 콘텐츠 중단 좌우, indicator는 콘텐츠
        // 정중앙 하단 - 콘텐츠가 viewport 일부만 차지해도 그 콘텐츠 자체
        // 박스 기준 가운데에 떠 있도록 함.
        isCarousel && currentItem ? (
          <div className="card-attach-carousel">
            <div className="card-attach-carousel-viewport">
              {renderMediaItem(currentItem)}
              <button
                type="button"
                className="card-attach-carousel-arrow card-attach-carousel-arrow-prev"
                aria-label="이전 미디어"
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaIndex((i) => (i - 1 + sorted.length) % sorted.length);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ChevronLeftIcon size={24} />
              </button>
              <button
                type="button"
                className="card-attach-carousel-arrow card-attach-carousel-arrow-next"
                aria-label="다음 미디어"
                onClick={(e) => {
                  e.stopPropagation();
                  setMediaIndex((i) => (i + 1) % sorted.length);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ChevronRightIcon size={24} />
              </button>
              <div className="card-attach-carousel-indicator" role="status" aria-label={`미디어 ${mediaIndex + 1} / ${sorted.length}`}>
                <div className="card-attach-carousel-dots">
                  {sorted.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      className={
                        "card-attach-carousel-dot" +
                        (i === mediaIndex ? " is-active" : "")
                      }
                      aria-label={`${i + 1}번째 미디어로 이동`}
                      aria-current={i === mediaIndex ? "true" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMediaIndex(i);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>{sorted.map((a) => renderMediaItem(a))}</>
        )
      ) : effectiveVideoUrl ? (
          (() => {
              const yt = getYouTubeId(effectiveVideoUrl);
              if (variant === "thumbnail") {
                if (yt && playedVideoIds.has("single-video")) {
                  return (
                    <div className="card-attach-video">
                      <iframe
                        src={`https://www.youtube.com/embed/${yt}?autoplay=1`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="YouTube"
                      />
                    </div>
                  );
                }
                return renderVideoPoster(
                  "single-video",
                  yt ? null : effectiveVideoUrl,
                  yt ? getYouTubeThumbnailUrl(yt) : null,
                  false,
                  yt ? "youtube" : "upload",
                  yt
                    ? () =>
                        setPlayedVideoIds((prev) =>
                          new Set(prev).add("single-video"),
                        )
                    : undefined,
                );
              }
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
            })()
        ) : null}
      {/* REMOVED (2026-06-13): legacy linkUrl→iframe branch. buildMediaItems()
          always pushes linkUrl as kind:"link" into allSorted, so this branch
          was dead code - its condition !allSorted.some((a) => a.kind==="link" && a.url===linkUrl)
          was always false. link videos render as OG cards via renderMediaItem's
          link branch; dedicated YouTube playback needs a proper video attachment. */}
      {shouldRenderDetailLinkPreview && linkUrl && canRenderCanvaEmbed && canvaDesignId ? (
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
      ) : shouldRenderDetailLinkPreview && linkUrl && !allSorted.some((a) => a.kind === "link" && a.url === linkUrl) ? (
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
            <span className="card-link-preview-url">
              🔗 {(() => {
                try { return new URL(linkUrl).hostname.replace(/^www\./, ""); }
                catch { return linkUrl; }
              })()}
            </span>
          </div>
        </a>
      ) : shouldRenderThumbnailLinkPreview && linkUrl && canRenderCanvaEmbed && canvaDesignId ? (
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
      ) : shouldRenderThumbnailLinkPreview && linkUrl ? (
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

function buildMediaItems({
  attachments,
  imageUrl,
  thumbUrl,
  videoUrl,
  linkUrl,
  linkTitle,
  linkDesc,
  linkImage,
  fileUrl,
  fileName,
  fileSize,
  fileMimeType,
}: Pick<
  Props,
  | "attachments"
  | "imageUrl"
  | "thumbUrl"
  | "videoUrl"
  | "linkUrl"
  | "linkTitle"
  | "linkDesc"
  | "linkImage"
  | "fileUrl"
  | "fileName"
  | "fileSize"
  | "fileMimeType"
>): AttachmentItem[] {
  const items = [...(attachments ?? [])].sort((a, b) => a.order - b.order);
  let nextOrder = items.length > 0 ? Math.max(...items.map((a) => a.order)) + 1 : 0;
  const has = (kind: string, url?: string | null) =>
    Boolean(url && items.some((a) => a.kind === kind && a.url === url));

  if (imageUrl && !has("image", imageUrl)) {
    items.unshift({
      id: `legacy-image-${imageUrl}`,
      kind: "image",
      url: imageUrl,
      previewUrl: thumbUrl ?? null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      order: -1,
    });
  }
  if (videoUrl && !has("video", videoUrl)) {
    items.push({
      id: `legacy-video-${videoUrl}`,
      kind: "video",
      url: videoUrl,
      previewUrl: null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      order: nextOrder++,
    });
  }
  // multi-link-attach (2026-06-13): legacy Card.linkUrl 단일 필드는 link
  // 첨부로 변환. attachments에 같은 URL의 link 첨부가 이미 있으면 중복 X.
  if (linkUrl && !has("link", linkUrl)) {
    items.push({
      id: `legacy-link-${linkUrl}`,
      kind: "link",
      url: linkUrl,
      previewUrl: linkImage ?? null,
      fileName: linkTitle ?? null,
      fileSize: null,
      mimeType: linkDesc ?? null,
      order: nextOrder++,
    });
  }
  if (fileUrl && !has("file", fileUrl)) {
    items.push({
      id: `legacy-file-${fileUrl}`,
      kind: "file",
      url: fileUrl,
      previewUrl: null,
      fileName: fileName ?? null,
      fileSize: fileSize ?? null,
      mimeType: fileMimeType ?? null,
      order: nextOrder++,
    });
  }

  return items.sort((a, b) => a.order - b.order);
}

function pickThumbnailItem(items: AttachmentItem[]): AttachmentItem | null {
  if (items.length === 0) return null;
  return (
    items.find((item) => item.kind === "image") ??
    items.find((item) => item.kind === "video" && (item.previewUrl || getYouTubeId(item.url))) ??
    items.find((item) => item.kind === "video") ??
    items[0] ??
    null
  );
}

// meta-download-zone (2026-06-13): 첨부 리스트에서 file 첨부만 분리.
// CardDetailModal이 메타 영역의 다운로드 리스트를 그릴 때 직접 사용.
export function extractFileAttachments(items: AttachmentItem[]): AttachmentItem[] {
  return items.filter((a) => a.kind === "file");
}

// NOTE: Legacy inline CanvaEmbed has been replaced by the virtualized
// CanvaEmbedSlot in ./CanvaEmbedSlot.tsx (T0-② tablet-crash mitigation).
// OptimizedImage (T0-④) is used for thumbnails and link previews above.
