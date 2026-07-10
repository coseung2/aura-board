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
import { buildCanvaEmbedSrc } from "@/lib/canva";
import {
  useIframeBudget,
  useLastEviction,
} from "@/hooks/useIframeBudget";
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
};

export const CanvaEmbedSlot = memo(function CanvaEmbedSlot({
  designId,
  linkUrl,
  linkTitle,
  linkImage,
  linkDesc,
}: Props) {
  // Per-instance slot id. Earlier versions used designId alone so "same
  // design appearing twice" would share a slot — but `useIsActive` then
  // returns the same boolean for every instance, so one ▶ click was
  // mounting every iframe that pointed at the same design (board had
  // sdsd + 공유 + 공개보기 all on DAHGsmYWF7E → 3 cards went live at once).
  // useId gives each CanvaEmbedSlot its own stable slot identity; the
  // LRU-3 cap still bounds total iframe count.
  const instanceId = useId();
  const slotId = `${designId}:${instanceId}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInViewport(containerRef);
  const { active, activate, deactivate } = useIframeBudget(slotId);
  const lastEviction = useLastEviction();

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [thumbnailAttempt, setThumbnailAttempt] = useState(0);
  const [lastGoodThumbnail, setLastGoodThumbnail] = useState<string | null>(null);
  const [evictedToast, setEvictedToast] = useState<string | null>(null);

  // IntersectionObserver starts at `false` and only flips once it has
  // actually reported an intersection. Gating the auto-deactivate on
  // inView directly would immediately undo the user's activate() before
  // the IO ever gets a chance to report — the ▶ button would look dead.
  // Track "was ever in view" so we only scroll-deactivate slots that
  // genuinely left the viewport.
  const wasEverInViewRef = useRef(false);
  useEffect(() => {
    if (inView) wasEverInViewRef.current = true;
  }, [inView]);

  useEffect(() => {
    if (!inView && active && wasEverInViewRef.current) {
      deactivate(slotId);
    }
  }, [inView, active, deactivate, slotId]);

  // Reset load state whenever we transition from inactive -> active so a
  // retry after eviction doesn't show a stale "loaded" opacity.
  useEffect(() => {
    if (active) {
      setIframeLoaded(false);
      setIframeFailed(false);
    }
  }, [active]);

  useEffect(() => {
    setThumbnailAttempt(0);
    setLastGoodThumbnail(null);
  }, [linkImage, linkUrl]);

  // When THIS slot is the one evicted by LRU overflow, keep the old state
  // bookkeeping. The visible toast was removed with the live/thumbnail badge.
  useEffect(() => {
    if (!lastEviction) return;
    if (lastEviction.id !== slotId) return;
    setEvictedToast("썸네일로 돌아감");
    const t = window.setTimeout(() => setEvictedToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [lastEviction, slotId]);

  const handleActivate = useCallback(
    (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      setIframeLoaded(false);
      setIframeFailed(false);
      activate(slotId);
    },
    [activate, slotId],
  );

  const handleKeyDownActivate = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleActivate(e);
      }
    },
    [handleActivate],
  );

  // Derive embed src from the original linkUrl so public "공개 보기" share
  // tokens (path segment between designId and /view) are preserved. Falls
  // back to the bare designId form for legacy rows / private designs.
  //
  // Keep this stable across iframe retries so a failed attempt remounts the
  // same public Canva player URL instead of falling back to a plain link.
  const embedSrc = useMemo(() => {
    return (
      buildCanvaEmbedSrc(linkUrl) ??
      `https://www.canva.com/design/${designId}/view?embed&meta`
    );
  }, [linkUrl, designId]);
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
  const candidateThumbnail =
    thumbnailCandidates[thumbnailAttempt] ?? CLIENT_FALLBACK_THUMBNAIL;
  const effectiveLinkImage =
    candidateThumbnail ?? lastGoodThumbnail ?? CLIENT_FALLBACK_THUMBNAIL;
  const handleThumbnailLoad = useCallback(() => {
    if (candidateThumbnail) {
      setLastGoodThumbnail(candidateThumbnail);
    }
  }, [candidateThumbnail]);
  const handleThumbnailError = useCallback(() => {
    setThumbnailAttempt((attempt) =>
      attempt < thumbnailCandidates.length - 1 ? attempt + 1 : attempt,
    );
  }, [thumbnailCandidates.length]);

  // Render the iframe as soon as the user activates. We no longer gate on
  // inView — the auto-deactivate useEffect above handles off-screen
  // eviction once IO reports genuine visibility. The LRU cap (3) still
  // prevents runaway iframe counts regardless.
  const shouldRenderIframe = active && !iframeFailed;
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
          key={candidateThumbnail}
          src={effectiveLinkImage}
          alt={`${title} 썸네일`}
          loading="lazy"
          decoding="async"
          onLoad={handleThumbnailLoad}
          onError={handleThumbnailError}
          className="card-canva-slot-thumbnail"
        />

        {shouldRenderIframe && (
          <iframe
            key={designId /* remount on designId change */}
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
        {!shouldRenderIframe && (
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
  return `/api/canva/card-thumbnail?design=${encodeURIComponent(
    linkUrl,
  )}&w=${CANVA_THUMBNAIL_WIDTH}`;
}

/**
 * Only trust thumbnails that are already outside Canva's expiring CDN/proxy
 * path. Old cards often contain `/api/canva/thumbnail?url=<temporary-url>` or
 * a raw canva-web-files URL; both must be resolved again from the design URL.
 */
function durableThumbnailCandidate(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("/api/canva/thumbnail?")) return null;

  try {
    const parsed = new URL(rawUrl, "https://aura-board.local");
    const host = parsed.hostname.toLowerCase();
    const isCanvaHost =
      host === "canva.com" ||
      host.endsWith(".canva.com") ||
      host.endsWith(".canva-web-files.com");
    return isCanvaHost ? null : rawUrl;
  } catch {
    return null;
  }
}

function buildClientFallbackThumbnail(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7d2ae8"/>
          <stop offset="1" stop-color="#00c4cc"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="24" fill="url(#bg)"/>
      <circle cx="116" cy="180" r="70" fill="rgba(255,255,255,.18)"/>
      <text x="116" y="207" text-anchor="middle" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#fff">C</text>
      <text x="208" y="172" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#fff">Canva 디자인</text>
      <text x="210" y="218" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,.86)">클릭하여 디자인 열기</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
