"use client";

import { useState } from "react";
import { OptimizedImage } from "@/components/ui/OptimizedImage";

type Props = {
  src: string;
  alt?: string;
  sizes?: string;
};

export function LinkPreviewImage({ src, alt = "", sizes }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className="card-link-preview-image optimized-img-wrap">
      {/* unoptimized: src is /api/link-preview/image?url=… — the proxy
          already enforces size + content-type limits, and the
          next/image optimizer's edge fetch is unreliable for Google
          User Content (yt3.googleusercontent.com) channel avatars
          (returns 502, triggering the "이미지를 불러올 수 없어요"
          fallback inside the saved link preview). */}
      <OptimizedImage
        src={src}
        alt={alt}
        sizes={sizes ?? "(max-width: 768px) 100vw, 480px"}
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}
