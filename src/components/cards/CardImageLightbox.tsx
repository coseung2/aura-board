"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
} from "../icons/UiIcons";

type ImageItem = {
  id: string;
  url: string;
  alt: string | null;
};

type Props = {
  images: ImageItem[];
  initialIndex: number;
  onClose: () => void;
};

// 카드 상세 모달 내부에서 이미지를 클릭했을 때 띄우는 전체화면 뷰어.
// 좌우 화살표(◀ ▶) + 키보드 ArrowLeft/ArrowRight + ESC 로 종료.
// 네비게이션은 인자로 받은 images 배열 안에서만 순환 — 카드 경계를
// 넘지 않음 (다른 카드로 이동 금지).
export function CardImageLightbox({ images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (images.length === 0) return null;
  const current = images[index];
  const multi = images.length > 1;

  const lightbox = (
    <div
      className="card-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 뷰어"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="ui-icon-action card-image-lightbox-close"
        onClick={onClose}
        aria-label="닫기"
      >
        <CloseIcon size={20} />
      </button>

      {multi && (
        <button
          type="button"
          className="card-image-lightbox-nav is-prev"
          onClick={prev}
          aria-label="이전 이미지"
        >
          <ChevronLeftIcon size={28} />
        </button>
      )}

      <img
        className="card-image-lightbox-img"
        src={current.url}
        alt={current.alt ?? ""}
      />

      {multi && (
        <button
          type="button"
          className="card-image-lightbox-nav is-next"
          onClick={next}
          aria-label="다음 이미지"
        >
          <ChevronRightIcon size={28} />
        </button>
      )}

      {multi && (
        <span className="card-image-lightbox-counter" aria-live="polite">
          {index + 1} / {images.length}
        </span>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(lightbox, document.body);
}
