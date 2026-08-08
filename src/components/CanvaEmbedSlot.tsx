"use client";

/**
 * CanvaEmbedSlot — viewport-virtualized, LRU-budgeted Canva iframe host.
 *
 * Default render: a static <img> thumbnail with a "라이브" play-overlay.
 * Tapping (or pressing Enter/Space) activates the slot, which mounts the
 * real Canva iframe in place. Scrolling the card out of viewport auto-
 * deactivates. Global LRU (max 3 active) auto-evicts the least-recently
 * activated card when a 4th is opened.
 *
 * Scope boundary:
 *   - This file owns the Canva-specific iframe lifecycle.
 *   - DraggableCard.tsx is NOT edited (concurrent agent on image-pipeline-t0-4
 *     is modifying that file). CardAttachments.tsx delegates here.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { buildCanvaEmbedSrc } from "@/lib/canva-url";
import { useIframeBudget, useLastEviction } from "@/hooks/useIframeBudget";
import { useInViewport } from "@/hooks/useInViewport";
import { PlayIcon } from "./icons/UiIcons";

const CANVA_THUMBNAIL_WIDTH = 640;
const CLIENT_FALLBACK_THUMBNAIL = buildClientFallbackThumbnail();

type Props = {
  designId: string;
  linkUrl: string;
  linkTitle: string | null;
  linkImage: string | null;
  linkDesc: string | null;
  /** Detail modals use the resolved thumbnail instead of live iframe chrome. */
  allowLive?: boolean;
};

export const CanvaEmbedSlot = memo(function CanvaEmbedSlot({
  designId,
  linkUrl,
  linkTitle,
  linkImage,
  linkDesc,
  allowLive = true,
}: Props) {
  const instanceId = useId();
  const slotId = `${designId}:${instanceId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInViewport(containerRef);
  const { active, activate, deactivate } = useIframeBudget(slotId);
  const lastEviction = useLastEviction();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [thumbnailAttempt, setThumbnailAttempt] = useState(0);
  const [evictedToast, setEvictedToast] = useState<string | null>(null);
  const wasEverInViewRef = useRef(false);

  useEffect(() => {
    if (inView) wasEverInViewRef.current = true;
  }, [inView]);

  useEffect(() => {
    if (!inView && active && wasEverInViewRef.current) deactivate(slotId);
  }, [inView, active, deactivate, slotId]);

  useEffect(() => {
    if (active) {
      setIframeLoaded(false);
      setIframeFailed(false);
    }
  }, [active]);

  useEffect(() => {
    setThumbnailAttempt(0);
  }, [linkImage, linkUrl]);

  useEffect(() => {
    if (!lastEviction || lastEviction.id !== slotId) return;
    setEvictedToast("썸네일로 돌아감");
    const timer = window.setTimeout(() => setEvictedToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [lastEviction, slotId]);

  const handleActivate = useCallback(
    (event: MouseEvent | KeyboardEvent) => {
      event.stopPropagation();
      setIframeLoaded(false);
      setIframeFailed(false);
      activate(slotId);
    },
    [activate, slotId],
  );

  const handleKeyDownActivate = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleActivate(event);
      }
    },
    [handleActivate],
  );

  const embedSrc = useMemo(
    () => buildCanvaEmbedSrc(linkUrl) ?? `https://www.canva.com/design/${designId}/view?embed&meta`,
    [linkUrl, designId],
  );
  const title = linkTitle || "Canva design";
  void linkDesc;

  const thumbnailCandidates = useMemo(() => {
    const candidates = [
      durableThumbnailCandidate(linkImage),
      buildResilientThumbnailUrl(linkUrl),
      CLIENT_FALLBACK_THUMBNAIL,
    ].filter((candidate): candidate is string => Boolean(candidate));
    return [...new Set(candidates)];
  }, [linkImage, linkUrl]);
  const effectiveLinkImage = thumbnailCandidates[thumbnailAttempt] ?? CLIENT_FALLBACK_THUMBNAIL;
  const handleThumbnailError = useCallback(() => {
    setThumbnailAttempt((attempt) => attempt < thumbnailCandidates.length - 1 ? attempt + 1 : attempt);
  }, [thumbnailCandidates.length]);

  const shouldRenderIframe = allowLive && active && !iframeFailed;
  void evictedToast;

  return (
    <div
      ref={containerRef}
      className="card-canva-slot"
      data-active={shouldRenderIframe ? "true" : "false"}
      data-loaded={shouldRenderIframe && iframeLoaded ? "true" : "false"}
      data-preview={!shouldRenderIframe ? "true" : "false"}
    >
      <div className="card-canva-slot-frame">
        <img
          key={effectiveLinkImage}
          src={effectiveLinkImage}
          alt={`${title} 썸네일`}
          loading="lazy"
          decoding="async"
          onError={handleThumbnailError}
          className="card-canva-slot-thumbnail"
        />
        {shouldRenderIframe && (
          <iframe
            key={designId}
            src={embedSrc}
            title={title}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeFailed(true)}
            className="card-canva-slot-iframe"
          />
        )}
        {!shouldRenderIframe && allowLive && (
          <div
            role="button"
            tabIndex={0}
            className="card-canva-slot-activate-overlay"
            aria-label={`${title} 라이브 모드로 열기`}
            onClick={handleActivate}
            onKeyDown={handleKeyDownActivate}
          >
            <span className="card-canva-slot-play-icon" aria-hidden="true">
              <PlayIcon size={20} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

function buildResilientThumbnailUrl(linkUrl: string): string {
  return `/api/canva/card-thumbnail?design=${encodeURIComponent(linkUrl)}&w=${CANVA_THUMBNAIL_WIDTH}`;
}

function durableThumbnailCandidate(rawUrl: string | null): string | null {
  if (!rawUrl || rawUrl.startsWith("/api/canva/thumbnail?")) return null;
  try {
    const parsed = new URL(rawUrl, "https://aura-board.local");
    const host = parsed.hostname.toLowerCase();
    const isCanvaHost = host === "canva.com" || host.endsWith(".canva.com") || host.endsWith(".canva-web-files.com");
    return isCanvaHost ? null : rawUrl;
  } catch {
    return null;
  }
}

function buildClientFallbackThumbnail(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d2ae8"/><stop offset="1" stop-color="#00c4cc"/></linearGradient></defs>
      <rect width="640" height="360" rx="24" fill="url(#bg)"/>
      <circle cx="116" cy="180" r="70" fill="rgba(255,255,255,.18)"/>
      <text x="116" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#fff">C</text>
      <text x="208" y="172" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#fff">Canva 디자인</text>
      <text x="210" y="218" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,.86)">클릭하여 디자인 열기</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
