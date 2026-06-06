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
      <OptimizedImage
        src={src}
        alt={alt}
        sizes={sizes ?? "(max-width: 768px) 100vw, 480px"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
