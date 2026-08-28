"use client";

import type { RefObject } from "react";
import { PlayIcon } from "../icons/UiIcons";

type Props = {
  posterKey: string;
  hostRef: RefObject<HTMLDivElement | null>;
  isSharedHost: boolean;
  videoUrlForFallback: string | null;
  posterUrl?: string | null;
  extraCount: number;
  extraBadge?: boolean;
  source: "youtube" | "upload";
  onClick?: () => void;
};

export function CardVideoPoster({
  posterKey,
  hostRef,
  isSharedHost,
  videoUrlForFallback,
  posterUrl,
  extraCount,
  extraBadge = true,
  source,
  onClick,
}: Props) {
  return (
    <div
      key={posterKey}
      ref={isSharedHost ? hostRef : undefined}
      className={`card-attach-video card-attach-media-poster card-attach-media-poster-${source}${onClick ? " is-clickable" : ""}`}
      onClick={onClick ? (event) => { event.stopPropagation(); onClick(); } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${source === "youtube" ? "YouTube" : "동영상"} 재생` : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }
      } : undefined}
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
          aria-hidden="true"
          className="card-attach-video-poster-img"
        />
      ) : (
        <div className="card-attach-video-placeholder" aria-hidden="true" />
      )}
      {source === "youtube" && onClick ? (
        <span className="card-attach-youtube-play" aria-hidden="true">
          <PlayIcon size={18} />
        </span>
      ) : source !== "youtube" && onClick ? (
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
}
