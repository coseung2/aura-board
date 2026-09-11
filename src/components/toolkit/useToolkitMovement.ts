"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

export function useToolkitMovement() {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);

  function move(left: number, top: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.visualViewport;
    const x = (viewport?.offsetLeft ?? 0) + 12;
    const y = (viewport?.offsetTop ?? 0) + 12;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    setPosition({
      left: Math.max(x, Math.min(left, x + width - rect.width - 24)),
      top: Math.max(y, Math.min(top, y + height - rect.height - 24)),
    });
  }

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const fit = () => {
      const viewport = window.visualViewport;
      panel.style.maxWidth = `${Math.max(0, (viewport?.width ?? window.innerWidth) - 24)}px`;
      panel.style.maxHeight = `${Math.max(0, (viewport?.height ?? window.innerHeight) - 24)}px`;
      const rect = panel.getBoundingClientRect();
      move(rect.left, rect.top);
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
  }, []);

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0 || !event.isPrimary) return;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      move(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
    },
    onPointerUp() { drag.current = null; },
    onPointerCancel() { drag.current = null; },
    onLostPointerCapture() { drag.current = null; },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      const rect = ref.current?.getBoundingClientRect();
      if (!direction || !rect) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 10;
      move(rect.left + direction[0] * step, rect.top + direction[1] * step);
    },
  };
  const style: CSSProperties = position ? { ...position, right: "auto", bottom: "auto" } : {};
  return { ref, style, handleProps };
}
