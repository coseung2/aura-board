"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

type Point = { x: number; y: number };

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// 카드 상세 모달 내부에서 이미지를 클릭했을 때 띄우는 전체화면 뷰어.
// 좌우 화살표(◀ ▶) + 키보드 ArrowLeft/ArrowRight + ESC 로 종료.
// 네비게이션은 인자로 받은 images 배열 안에서만 순환 — 카드 경계를
// 넘지 않음 (다른 카드로 이동 금지).
export function CardImageLightbox({ images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, Point>());
  const dragPointRef = useRef<Point | null>(null);
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    midpoint: Point;
    offset: Point;
  } | null>(null);

  const resetZoom = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    dragPointRef.current = null;
    pinchRef.current = null;
  }, []);

  const changeScale = useCallback((nextScale: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    setScale(clamped);
    if (clamped === MIN_SCALE) setOffset({ x: 0, y: 0 });
  }, []);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    resetZoom();
  }, [index, resetZoom]);

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
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setScale((value) => Math.min(MAX_SCALE, value + SCALE_STEP));
      } else if (e.key === "-") {
        e.preventDefault();
        setScale((value) => {
          const nextScale = Math.max(MIN_SCALE, value - SCALE_STEP);
          if (nextScale === MIN_SCALE) setOffset({ x: 0, y: 0 });
          return nextScale;
        });
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next, resetZoom]);

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

  function beginPinch() {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return;
    pinchRef.current = {
      distance: Math.max(1, distance(points[0], points[1])),
      scale,
      midpoint: midpoint(points[0], points[1]),
      offset,
    };
    dragPointRef.current = null;
  }

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

      <div
        className={`card-image-lightbox-stage${scale > MIN_SCALE ? " is-zoomed" : ""}`}
        onWheel={(event) => {
          event.preventDefault();
          changeScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
        }}
        onDoubleClick={() => {
          if (scale > MIN_SCALE) resetZoom();
          else changeScale(2);
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = { x: event.clientX, y: event.clientY };
          pointersRef.current.set(event.pointerId, point);
          if (pointersRef.current.size === 2) beginPinch();
          else dragPointRef.current = point;
        }}
        onPointerMove={(event) => {
          if (!pointersRef.current.has(event.pointerId)) return;
          const point = { x: event.clientX, y: event.clientY };
          pointersRef.current.set(event.pointerId, point);
          const points = [...pointersRef.current.values()];

          if (points.length >= 2 && pinchRef.current) {
            const currentMidpoint = midpoint(points[0], points[1]);
            const nextScale = Math.max(
              MIN_SCALE,
              Math.min(
                MAX_SCALE,
                pinchRef.current.scale *
                  (distance(points[0], points[1]) / pinchRef.current.distance),
              ),
            );
            setScale(nextScale);
            setOffset(
              nextScale === MIN_SCALE
                ? { x: 0, y: 0 }
                : {
                    x:
                      pinchRef.current.offset.x +
                      currentMidpoint.x -
                      pinchRef.current.midpoint.x,
                    y:
                      pinchRef.current.offset.y +
                      currentMidpoint.y -
                      pinchRef.current.midpoint.y,
                  },
            );
          } else if (scale > MIN_SCALE && dragPointRef.current) {
            setOffset((value) => ({
              x: value.x + point.x - dragPointRef.current!.x,
              y: value.y + point.y - dragPointRef.current!.y,
            }));
            dragPointRef.current = point;
          }
        }}
        onPointerUp={(event) => {
          pointersRef.current.delete(event.pointerId);
          pinchRef.current = null;
          const remaining = [...pointersRef.current.values()];
          dragPointRef.current = remaining[0] ?? null;
        }}
        onPointerCancel={(event) => {
          pointersRef.current.delete(event.pointerId);
          pinchRef.current = null;
          dragPointRef.current = null;
        }}
      >
        <img
          className="card-image-lightbox-img"
          src={current.url}
          alt={current.alt ?? ""}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
        />
      </div>

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

      <div className="card-image-lightbox-zoom" aria-label="이미지 확대/축소">
        <button
          type="button"
          onClick={() => changeScale(scale - SCALE_STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="축소"
        >
          −
        </button>
        <button
          type="button"
          className="card-image-lightbox-zoom-value"
          onClick={resetZoom}
          disabled={scale === MIN_SCALE}
          aria-label="원래 크기로"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={() => changeScale(scale + SCALE_STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="확대"
        >
          +
        </button>
      </div>

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
