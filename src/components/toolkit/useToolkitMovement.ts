"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

type Geometry = { left: number; top: number; width: number; height: number };
type ToolkitMovementOptions = {
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
};

const VIEWPORT_MARGIN = 12;

function viewportBounds() {
  const viewport = window.visualViewport;
  return {
    left: (viewport?.offsetLeft ?? 0) + VIEWPORT_MARGIN,
    top: (viewport?.offsetTop ?? 0) + VIEWPORT_MARGIN,
    width: Math.max(0, (viewport?.width ?? window.innerWidth) - VIEWPORT_MARGIN * 2),
    height: Math.max(0, (viewport?.height ?? window.innerHeight) - VIEWPORT_MARGIN * 2),
  };
}

function clampGeometry(geometry: Geometry, minWidth: number, minHeight: number): Geometry {
  const viewport = viewportBounds();
  const width = Math.min(viewport.width, Math.max(Math.min(minWidth, viewport.width), geometry.width));
  const height = Math.min(viewport.height, Math.max(Math.min(minHeight, viewport.height), geometry.height));
  return {
    left: Math.max(viewport.left, Math.min(geometry.left, viewport.left + viewport.width - width)),
    top: Math.max(viewport.top, Math.min(geometry.top, viewport.top + viewport.height - height)),
    width,
    height,
  };
}

function sameGeometry(left: Geometry | null, right: Geometry) {
  return !!left && left.left === right.left && left.top === right.top && left.width === right.width && left.height === right.height;
}

export function useToolkitMovement({
  initialWidth = 640,
  initialHeight = 760,
  minWidth = 360,
  minHeight = 360,
}: ToolkitMovementOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; geometry: Geometry } | null>(null);
  const resize = useRef<{ id: number; x: number; y: number; geometry: Geometry } | null>(null);

  const updateGeometry = (next: Geometry) => {
    const clamped = clampGeometry(next, minWidth, minHeight);
    setGeometry((current) => sameGeometry(current, clamped) ? current : clamped);
  };

  const currentGeometry = (): Geometry | null => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
  };

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const fit = () => {
      setGeometry((current) => {
        if (current) {
          const clamped = clampGeometry(current, minWidth, minHeight);
          return sameGeometry(current, clamped) ? current : clamped;
        }
        const viewport = viewportBounds();
        const width = Math.min(initialWidth, viewport.width);
        const height = Math.min(initialHeight, viewport.height);
        return clampGeometry({
          left: viewport.left + (viewport.width - width) / 2,
          top: viewport.top + (viewport.height - height) / 2,
          width,
          height,
        }, minWidth, minHeight);
      });
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(panel);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
    };
  }, [initialHeight, initialWidth, minHeight, minWidth]);

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || !event.isPrimary) return;
      const current = currentGeometry();
      if (!current) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, geometry: current };
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      updateGeometry({ ...start.geometry, left: start.geometry.left + event.clientX - start.x, top: start.geometry.top + event.clientY - start.y });
    },
    onPointerUp() { drag.current = null; },
    onPointerCancel() { drag.current = null; },
    onLostPointerCapture() { drag.current = null; },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      const current = currentGeometry();
      if (!direction || !current) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 10;
      updateGeometry({ ...current, left: current.left + direction[0] * step, top: current.top + direction[1] * step });
    },
  };

  const resizeHandleProps = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || !event.isPrimary) return;
      const current = currentGeometry();
      if (!current) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      resize.current = { id: event.pointerId, x: event.clientX, y: event.clientY, geometry: current };
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = resize.current;
      if (!start || start.id !== event.pointerId) return;
      updateGeometry({ ...start.geometry, width: start.geometry.width + event.clientX - start.x, height: start.geometry.height + event.clientY - start.y });
    },
    onPointerUp() { resize.current = null; },
    onPointerCancel() { resize.current = null; },
    onLostPointerCapture() { resize.current = null; },
  };

  const style: CSSProperties = geometry ? { ...geometry, right: "auto", bottom: "auto" } : { visibility: "hidden" };
  return { ref, style, handleProps, resizeHandleProps };
}
