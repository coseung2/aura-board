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

function getYouTubeId(url: string): string | null { return extractVideoId(url); }
function getYouTubeThumbnailUrl(videoId: string): string { return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`; }
function hasSameYouTubeId(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const aId = getYouTubeId(a); const bId = getYouTubeId(b);
  return Boolean(aId && bId && aId === bId);
}

type AttachmentItem = { id: string; kind: string; url: string; previewUrl?: string | null; fileName: string | null; fileSize: number | null; mimeType: string | null; order: number };
type Props = { imageUrl?: string | null; thumbUrl?: string | null; linkUrl?: string | null; linkTitle?: string | null; linkDesc?: string | null; linkImage?: string | null; videoUrl?: string | null; fileUrl?: string | null; fileName?: string | null; fileSize?: number | null; fileMimeType?: string | null; attachments?: AttachmentItem[]; variant?: "thumbnail" | "detail"; onImageClick?: (imageIndex: number) => void };

export const CardAttachments = memo(function CardAttachments({ imageUrl, thumbUrl, linkUrl, linkTitle, linkDesc, linkImage, videoUrl, fileUrl, fileName, fileSize, fileMimeType, attachments, variant = "detail", onImageClick }: Props) {
  const [playedVideoIds, setPlayedVideoIds] = useState<Set<string>>(new Set());
  const [mediaIndex, setMediaIndex] = useState(0);
  const allSorted = buildMediaItems({ attachments, imageUrl, thumbUrl, videoUrl, linkUrl, linkTitle, linkDesc, linkImage, fileUrl, fileName, fileSize, fileMimeType });
  const hasAttachments = allSorted.length > 0;
  const canvaDesignId = linkUrl ? extractCanvaDesignId(linkUrl) : null;
  const linkYouTubeId = linkUrl ? getYouTubeId(linkUrl) : null;
  const effectiveVideoUrl = videoUrl ?? (linkYouTubeId ? linkUrl : null);
  const shouldHideLinkPreview = Boolean(linkYouTubeId);
  const shouldPromoteLink = shouldPromoteLinkPreview({ imageUrl, linkUrl, videoUrl, fileUrl, attachments });
  const canRenderCanvaEmbed = Boolean(canvaDesignId);
  const hasLinkPreviewContent = Boolean(canRenderCanvaEmbed || linkImage || linkTitle || linkDesc);
  const shouldRenderDetailLinkPreview = Boolean(variant === "detail" && linkUrl && !shouldHideLinkPreview && hasLinkPreviewContent);
  const shouldRenderThumbnailLinkPreview = Boolean(variant === "thumbnail" && linkUrl && !hasAttachments && shouldPromoteLink && !shouldHideLinkPreview);
  const linkedYouTubeAlreadyInMedia = Boolean(linkUrl && linkYouTubeId && ((!hasAttachments && effectiveVideoUrl === linkUrl) || hasSameYouTubeId(videoUrl, linkUrl) || allSorted.some((item) => item.kind === "video" && hasSameYouTubeId(item.url, linkUrl))));
  const linkCountsAsAdditionalMedia = Boolean(linkUrl && (linkYouTubeId ? !linkedYouTubeAlreadyInMedia : true) && (hasAttachments || variant === "detail" || shouldRenderThumbnailLinkPreview));
  const linkRendersAsMedia = Boolean(linkUrl && ((variant === "thumbnail" && linkCountsAsAdditionalMedia) || (linkYouTubeId && !linkedYouTubeAlreadyInMedia) || (!shouldHideLinkPreview && (variant === "detail" ? hasLinkPreviewContent : shouldRenderThumbnailLinkPreview))));
  const fileAttachments = allSorted.filter((a) => a.kind === "file");
  const mediaSorted = allSorted.filter((a) => a.kind !== "file");
  const thumbnailItem = pickThumbnailItem(mediaSorted);
  const thumbnailFileItem = variant === "thumbnail" && !thumbnailItem ? fileAttachments[0] ?? null : null;
  const sorted = variant === "thumbnail" ? thumbnailItem ? [thumbnailItem] : thumbnailFileItem ? [thumbnailFileItem] : [] : mediaSorted;
  const isCarousel = variant === "detail" && sorted.length > 1;
  const currentItem = isCarousel ? sorted[Math.min(mediaIndex, sorted.length - 1)] : null;
  const extraCount = variant === "thumbnail" ? Math.max(0, mediaSorted.length + fileAttachments.length - (thumbnailItem || thumbnailFileItem ? 1 : 0) + (linkRendersAsMedia ? 1 : 0)) : 0;
  const imageAttachments = sorted.filter((a) => a.kind === "image");
  useEffect(() => { setMediaIndex(mediaSorted.length === 0 ? 0 : (i) => i >= mediaSorted.length ? 0 : i); }, [mediaSorted.length]);
  if (!allSorted.length && !linkUrl && !thumbnailFileItem) return null;

  const renderVideoPoster = (key: string, videoUrlForFallback: string | null, posterUrl?: string | null, extraBadge = true, source: "youtube" | "upload" = "upload", onClick?: () => void) => (
    <div key={key} className={`card-attach-video card-attach-media-poster card-attach-media-poster-${source}${onClick ? " is-clickable" : ""}`} onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClick(); } } : undefined}>
      {posterUrl ? <img src={posterUrl} alt="" loading="lazy" decoding="async" className="card-attach-video-poster-img" /> : videoUrlForFallback ? <video src={videoUrlForFallback} preload="metadata" muted playsInline className="card-attach-video-poster-img" /> : <div className="card-attach-video-placeholder" aria-hidden="true" />}
      {source === "youtube" && onClick ? <span className="card-attach-youtube-play" aria-hidden="true"><PlayIcon size={18} /></span> : source !== "youtube" ? <span className="card-attach-video-play" aria-hidden="true"><PlayIcon size={20} /></span> : null}
      {extraBadge && extraCount > 0 && <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}
    </div>
  );

  const renderMediaItem = (a: AttachmentItem) => {
    if (a.kind === "image") {
      const imageSrc = variant === "thumbnail" ? a.previewUrl ?? a.url : a.url;
      if (variant === "detail") {
        const imgIdx = imageAttachments.findIndex((it) => it.id === a.id); const clickable = !!onImageClick;
        return <div key={a.id} className="card-attach-image is-detail"><img src={imageSrc} alt={a.fileName ?? ""} loading="lazy" decoding="async" className={clickable ? "is-clickable" : undefined} onClick={clickable ? () => onImageClick!(imgIdx) : undefined} />{extraCount > 0 && <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}</div>;
      }
      return <div key={a.id} className="card-attach-image optimized-img-wrap"><OptimizedImage src={imageSrc} alt={a.fileName ?? ""} sizes="(max-width: 768px) 100vw, 480px" />{extraCount > 0 && <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}</div>;
    }
    if (a.kind === "video") {
      const yt = getYouTubeId(a.url);
      if (variant === "thumbnail") {
        if (yt && playedVideoIds.has(a.id)) return <div key={a.id} className="card-attach-video"><iframe src={`https://www.youtube.com/embed/${yt}?autoplay=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="YouTube" /></div>;
        return renderVideoPoster(a.id, yt ? null : a.url, a.previewUrl ?? (yt ? getYouTubeThumbnailUrl(yt) : null), true, yt ? "youtube" : "upload", yt ? () => setPlayedVideoIds((prev) => new Set(prev).add(a.id)) : undefined);
      }
      if (yt) return <div key={a.id} className="card-attach-video"><iframe src={`https://www.youtube.com/embed/${yt}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="YouTube" />{extraCount > 0 && <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}</div>;
      return <div key={a.id} className="card-attach-video"><video src={a.url} controls preload="metadata" poster={a.previewUrl ?? undefined} />{extraCount > 0 && <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}</div>;
    }
    if (a.kind === "link") {
      const canvaAttachmentDesignId = extractCanvaDesignId(a.url);
      if (canvaAttachmentDesignId) return <CanvaEmbedSlot key={a.id} designId={canvaAttachmentDesignId} linkUrl={a.url} linkTitle={a.fileName ?? null} linkImage={a.previewUrl ?? null} linkDesc={a.mimeType ?? null} allowLive={variant !== "detail"} />;
      return <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className={`card-link-preview ${a.previewUrl ? "has-image" : ""}`} onClick={(e) => e.stopPropagation()}>{a.previewUrl && <LinkPreviewImage src={a.previewUrl} sizes="(max-width: 768px) 100vw, 480px" />}<div className="card-link-preview-body"><span className="card-link-preview-title">{a.fileName || (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return a.url; } })()}</span><span className="card-link-preview-url">🔗 {(() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return a.url; } })()}</span>{a.mimeType && <span className="card-link-preview-desc">{a.mimeType}</span>}</div></a>;
    }
    if (variant === "thumbnail") {
      const icon = fileMimeToIcon(a.mimeType ?? ""); const label = fileMimeToLabel(a.mimeType ?? "");
      return <div key={a.id} className="card-attach-file-thumbnail"><div className="card-attach-file-thumbnail-icon" aria-hidden>{icon}</div><div className="card-attach-file-thumbnail-body"><span className="card-attach-file-thumbnail-name" title={a.fileName ?? "파일"}>{a.fileName ?? "파일"}</span><span className="card-attach-file-thumbnail-meta">{a.fileSize ? formatBytes(a.fileSize) : "-"} · {label}</span></div>{extraCount > 0 && <span className="card-attach-multi-badge" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}</div>;
    }
    return <div key={a.id} className="card-attach-file-wrap"><CardFileAttachment fileUrl={a.url} fileName={a.fileName} fileSize={a.fileSize} fileMimeType={a.mimeType} />{extraCount > 0 && <span className="card-attach-multi-badge is-inline" aria-label={`+${extraCount}개 더`}>+{extraCount}</span>}</div>;
  };

  return (
    <div className="card-attachments">
      {hasAttachments ? isCarousel && currentItem ? <div className="card-attach-carousel"><div className="card-attach-carousel-viewport">{renderMediaItem(currentItem)}<button type="button" className="card-attach-carousel-arrow card-attach-carousel-arrow-prev" aria-label="이전 미디어" onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => (i - 1 + sorted.length) % sorted.length); }} onMouseDown={(e) => e.stopPropagation()}><ChevronLeftIcon size={24} /></button><button type="button" className="card-attach-carousel-arrow card-attach-carousel-arrow-next" aria-label="다음 미디어" onClick={(e) => { e.stopPropagation(); setMediaIndex((i) => (i + 1) % sorted.length); }} onMouseDown={(e) => e.stopPropagation()}><ChevronRightIcon size={24} /></button><div className="card-attach-carousel-indicator" role="status" aria-label={`미디어 ${mediaIndex + 1} / ${sorted.length}`}><div className="card-attach-carousel-dots">{sorted.map((s, i) => <button key={s.id} type="button" className={"card-attach-carousel-dot" + (i === mediaIndex ? " is-active" : "")} aria-label={`${i + 1}번째 미디어로 이동`} aria-current={i === mediaIndex ? "true" : undefined} onClick={(e) => { e.stopPropagation(); setMediaIndex(i); }} />)}</div></div></div></div> : <>{sorted.map((a) => renderMediaItem(a))}</> : effectiveVideoUrl ? (() => { const yt = getYouTubeId(effectiveVideoUrl); if (variant === "thumbnail") { if (yt && playedVideoIds.has("single-video")) return <div className="card-attach-video"><iframe src={`https://www.youtube.com/embed/${yt}?autoplay=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="YouTube" /></div>; return renderVideoPoster("single-video", yt ? null : effectiveVideoUrl, yt ? getYouTubeThumbnailUrl(yt) : null, false, yt ? "youtube" : "upload", yt ? () => setPlayedVideoIds((prev) => new Set(prev).add("single-video")) : undefined); } return yt ? <div className="card-attach-video"><iframe src={`https://www.youtube.com/embed/${yt}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="YouTube" /></div> : <div className="card-attach-video"><video src={effectiveVideoUrl} controls preload="metadata" /></div>; })() : null}
      {shouldRenderDetailLinkPreview && linkUrl && canRenderCanvaEmbed && canvaDesignId ? <CanvaEmbedSlot key={canvaDesignId} designId={canvaDesignId} linkUrl={linkUrl} linkTitle={linkTitle ?? null} linkImage={linkImage ?? null} linkDesc={linkDesc ?? null} allowLive={false} /> : shouldRenderDetailLinkPreview && linkUrl && !allSorted.some((a) => a.kind === "link" && a.url === linkUrl) ? <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={`card-link-preview ${linkImage ? "has-image" : ""}`} onClick={(e) => e.stopPropagation()}>{linkImage && <LinkPreviewImage src={linkImage} sizes="(max-width: 768px) 100vw, 480px" />}<div className="card-link-preview-body"><span className="card-link-preview-title">{linkTitle || (() => { try { return new URL(linkUrl).hostname.replace(/^www\./, ""); } catch { return linkUrl; } })()}</span><span className="card-link-preview-url">🔗 {(() => { try { return new URL(linkUrl).hostname.replace(/^www\./, ""); } catch { return linkUrl; } })()}</span></div></a> : shouldRenderThumbnailLinkPreview && linkUrl && canRenderCanvaEmbed && canvaDesignId ? <CanvaEmbedSlot key={canvaDesignId} designId={canvaDesignId} linkUrl={linkUrl} linkTitle={linkTitle ?? null} linkImage={linkImage ?? null} linkDesc={linkDesc ?? null} allowLive /> : shouldRenderThumbnailLinkPreview && linkUrl ? <a href={linkUrl} target="_blank" rel="noopener noreferrer" className={`card-link-preview ${linkImage ? "has-image" : ""}`} onClick={(e) => e.stopPropagation()}>{linkImage && <LinkPreviewImage src={linkImage} sizes="(max-width: 768px) 100vw, 480px" />}<div className="card-link-preview-body"><span className="card-link-preview-title">{linkTitle || (() => { try { return new URL(linkUrl).hostname.replace(/^www\./, ""); } catch { return linkUrl; } })()}</span><span className="card-link-preview-url">🔗 {(() => { try { return new URL(linkUrl).hostname.replace(/^www\./, ""); } catch { return linkUrl; } })()}</span></div></a> : null}
    </div>
  );
});

function buildMediaItems({ attachments, imageUrl, thumbUrl, videoUrl, linkUrl, linkTitle, linkDesc, linkImage, fileUrl, fileName, fileSize, fileMimeType }: Pick<Props, "attachments" | "imageUrl" | "thumbUrl" | "videoUrl" | "linkUrl" | "linkTitle" | "linkDesc" | "linkImage" | "fileUrl" | "fileName" | "fileSize" | "fileMimeType">): AttachmentItem[] {
  const items = [...(attachments ?? [])].sort((a, b) => a.order - b.order);
  let nextOrder = items.length > 0 ? Math.max(...items.map((a) => a.order)) + 1 : 0;
  const has = (kind: string, url?: string | null) => Boolean(url && items.some((a) => a.kind === kind && a.url === url));
  if (imageUrl && !has("image", imageUrl)) items.unshift({ id: `legacy-image-${imageUrl}`, kind: "image", url: imageUrl, previewUrl: thumbUrl ?? null, fileName: null, fileSize: null, mimeType: null, order: -1 });
  if (videoUrl && !has("video", videoUrl)) items.push({ id: `legacy-video-${videoUrl}`, kind: "video", url: videoUrl, previewUrl: null, fileName: null, fileSize: null, mimeType: null, order: nextOrder++ });
  if (linkUrl && !has("link", linkUrl)) items.push({ id: `legacy-link-${linkUrl}`, kind: "link", url: linkUrl, previewUrl: linkImage ?? null, fileName: linkTitle ?? null, fileSize: null, mimeType: linkDesc ?? null, order: nextOrder++ });
  if (fileUrl && !has("file", fileUrl)) items.push({ id: `legacy-file-${fileUrl}`, kind: "file", url: fileUrl, previewUrl: null, fileName: fileName ?? null, fileSize: fileSize ?? null, mimeType: fileMimeType ?? null, order: nextOrder++ });
  return items.sort((a, b) => a.order - b.order);
}
function pickThumbnailItem(items: AttachmentItem[]): AttachmentItem | null { return items.find((item) => item.kind === "image") ?? items.find((item) => item.kind === "video" && (item.previewUrl || getYouTubeId(item.url))) ?? items.find((item) => item.kind === "video") ?? items[0] ?? null; }
export function extractFileAttachments(items: AttachmentItem[]): AttachmentItem[] { return items.filter((a) => a.kind === "file"); }
