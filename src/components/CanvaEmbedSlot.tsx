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

  // Fallback timeout: some Canva designs (/view share surface on certain
  // document/poster types) throw a state-deserialize error inside the
  // iframe and never fire onLoad/onError on the parent. If we don't hear
  // back within 8 seconds, treat it as a silent failure and surface the
  // link-preview so the card is never blank.
  useEffect(() => {
    if (!active || iframeLoaded || iframeFailed) return;
    const t = window.setTimeout(() => setIframeFailed(true), 8000);
    return () => window.clearTimeout(t);
  }, [active, iframeLoaded, iframeFailed]);

  // When THIS slot is the one evicted by LRU overflow, show a brief toast
  // on its header. Other slots ignore the eviction event.
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
      activate(slotId);
    },
    [activate, slotId],
  );

  const handleToggle = useCallback(
    (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      if (active) deactivate(slotId);
      else activate(slotId);
    },
    [active, activate, deactivate, slotId],
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

  const handleKeyDownToggle = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle(e);
      }
    },
    [handleToggle],
  );

  // Derive embed src from the original linkUrl so public "공개 보기" share
  // tokens (path segment between designId and /view) are preserved. Falls
  // back to the bare designId form for legacy rows / private designs.
  //
  // MUST run before the iframeFailed early return — React's rules-of-hooks
  // fires #300 ("rendered fewer hooks") when iframeFailed flips true and
  // we skip this useMemo after having called it on the previous render.
  const embedSrc = useMemo(() => {
    return (
      buildCanvaEmbedSrc(linkUrl) ??
      `https://www.canva.com/design/${designId}/view?embed&meta`
    );
  }, [linkUrl, designId]);

  // Fallback branch: iframe errored. Surface the original link-preview
  // style anchor so the card is never empty.
  if (iframeFailed) {
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`card-link-preview ${linkImage ? "has-image" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {linkImage && (
          <div className="card-link-preview-image">
            <img src={linkImage} alt="" loading="lazy" />
          </div>
        )}
        <div className="card-link-preview-body">
          <span className="card-link-preview-title">
            {linkTitle || "Canva design"}
          </span>
          {linkDesc && <span className="card-link-preview-desc">{linkDesc}</span>}
          <span className="card-link-preview-url">🔗 canva.com</span>
        </div>
      </a>
    );
  }

  const title = linkTitle || "Canva design";
  // Render the iframe as soon as the user activates. We no longer gate on
  // inView — the auto-deactivate useEffect above handles off-screen
  // eviction once IO reports genuine visibility. The LRU cap (3) still
  // prevents runaway iframe counts regardless.
  const shouldRenderIframe = active;

  return (
    <div
      ref={containerRef}
      className="card-canva-slot"
      data-active={active ? "true" : "false"}
      data-loaded={iframeLoaded ? "true" : "false"}
    >
      {/* Header badge: clickable / keyboard toggle between thumbnail and live. */}
      <div className="card-canva-slot-header">
        <button
          type="button"
          className="card-canva-mode-badge"
          data-mode={active ? "live" : "thumbnail"}
          aria-pressed={active}
          aria-label={
            active
              ? "라이브 모드 끄기 (썸네일로 전환)"
              : "라이브 모드 켜기 (Canva 에디터 로드)"
          }
          onClick={handleToggle}
          onKeyDown={handleKeyDownToggle}
        >
          <span className="card-canva-mode-dot" aria-hidden="true" />
          {active ? "라이브" : "썸네일"}
        </button>
        {evictedToast && (
          <span className="card-canva-eviction-toast" role="status">
            {evictedToast}
          </span>
        )}
      </div>

      <div className="card-canva-slot-frame">
        {linkImage ? (
          // Thumbnail always painted underneath — acts as LCP image and as
          // the background that shows through while iframe boots (and after
          // eviction). loading="lazy" is safe because the slot is cheap.
          <img
            src={linkImage}
            alt={`${title} 썸네일`}
            loading="lazy"
            className="card-canva-slot-thumbnail"
          />
        ) : (
          // No oEmbed thumbnail (anonymous 401 is the common case) —
          // paint a neutral placeholder so the slot isn't visually empty
          // before the iframe loads. Labelled "Canva 디자인" so the user
          // knows what they're about to see.
          <div
            className="card-canva-slot-thumbnail card-canva-slot-placeholder"
            aria-hidden="true"
          >
            <span className="card-canva-slot-placeholder-label">
              Canva 디자인
            </span>
          </div>
        )}

        {shouldRenderIframe ? (
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
        ) : (
          // Thumbnail-mode play overlay. The whole overlay is itself a
          // button-like region: tap to activate. Keyboard users get
          // Enter/Space via the onKeyDown handler. role="button" + tabIndex
          // surface it to AT.
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
            <span className="card-canva-slot-overlay-label">라이브 모드</span>
          </div>
        )}
      </div>
    </div>
  );
});
