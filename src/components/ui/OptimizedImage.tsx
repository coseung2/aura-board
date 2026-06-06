"use client";

import Image from "next/image";
import { memo, useState } from "react";

type OptimizedImageProps = {
  src: string;
  alt: string;
  /**
   * Responsive sizes hint. Defaults to a typical card slot on tablet
   * (100vw on phone, 480px slot on tablet+). Set explicitly for
   * thumbnails, lightboxes, etc.
   */
  sizes?: string;
  /** Set true for above-the-fold / modal hero images. */
  priority?: boolean;
  className?: string;
  /** Use fill mode (parent must be `position: relative`). Default: true. */
  fill?: boolean;
  /** Required when `fill=false`. */
  width?: number;
  /** Required when `fill=false`. */
  height?: number;
  /**
   * Bypass Next.js Image Optimization. Automatically enabled for
   * data: URIs (QR codes, inline SVGs).
   */
  unoptimized?: boolean;
  /** CSS object-fit. Default: cover. */
  fit?: "cover" | "contain";
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
};

const DEFAULT_SIZES = "(max-width: 768px) 100vw, 480px";

/**
 * Thin wrapper over next/image. Use everywhere we currently have
 * raw <img> for content rendering. Benefits:
 *  - Automatic responsive srcset (Image Optimization)
 *  - loading="lazy" by default (above-the-fold: set priority)
 *  - Error fallback placeholder
 *  - Data-URI auto-passthrough (QR, inline SVG)
 *
 * Rules:
 *  - For remote hosts, add the pattern to next.config.ts `images.remotePatterns`.
 *  - In `fill` mode, the parent container MUST have an explicit width AND
 *    height (or aspect-ratio) and `position: relative`. Existing CSS
 *    classes like `.card-attach-image`, `.plant-thumb`, etc. already
 *    satisfy this.
 */
export const OptimizedImage = memo(function OptimizedImage({
  src,
  alt,
  sizes = DEFAULT_SIZES,
  priority = false,
  className,
  fill = true,
  width,
  height,
  unoptimized,
  fit = "cover",
  onError,
}: OptimizedImageProps) {
  const [failed, setFailed] = useState(false);

  // Auto-enable unoptimized for data/blob URIs — next/image can't
  // fetch these via the optimizer.
  const isDataLike =
    src.startsWith("data:") || src.startsWith("blob:") || src.endsWith(".svg");
  const effectiveUnoptimized = unoptimized ?? isDataLike;

  if (failed) {
    return (
      <div className="optimized-img-error" role="img" aria-label={alt || "이미지"}>
        이미지 없음
      </div>
    );
  }

  const commonProps = {
    src,
    alt,
    sizes: fill ? sizes : undefined,
    priority,
    loading: priority ? undefined : ("lazy" as const),
    unoptimized: effectiveUnoptimized,
    className,
    style: { objectFit: fit } as React.CSSProperties,
    onError: (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setFailed(true);
      if (onError) onError(e);
    },
  };

  if (fill) {
    return <Image {...commonProps} fill />;
  }

  // Intrinsic mode requires explicit width + height.
  if (width == null || height == null) {
    console.warn(
      "[OptimizedImage] fill=false requires width and height props; falling back to fill.",
    );
    return <Image {...commonProps} fill />;
  }

  return <Image {...commonProps} width={width} height={height} />;
});
