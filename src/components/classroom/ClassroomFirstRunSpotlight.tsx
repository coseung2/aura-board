"use client";

/**
 * 학급을 막 만든 교사용 1회성 안내.
 *
 * 화면 전체를 어둡게 깔고 "학생 명단" 카드만 뚫어 준 뒤, 그 옆에서 학생
 * 추가로 바로 넘어갈 수 있게 한다. 카드 자체는 그대로 눌릴 수 있고(구멍은
 * pointer-events: none), 바깥을 누르거나 Esc 로 닫는다. 닫으면 다시 뜨지
 * 않는다 — 노출 여부는 호출한 쪽(URL 파라미터)이 결정한다.
 */

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";

type Rect = { top: number; left: number; width: number; height: number };

type Props = {
  /** 구멍을 뚫을 요소의 id. 없으면 안내를 띄우지 않는다. */
  targetId: string;
  /** 강조하는 카드 위에 띄울 한 줄. */
  message: string;
  actionHref: string;
  actionLabel: string;
  onDismiss: () => void;
};

const HOLE_PADDING = 6;
const EDGE = 16;
const CARD_WIDTH = 268;
const CARD_GAP = 12;

export function ClassroomFirstRunSpotlight({
  targetId,
  message,
  actionHref,
  actionLabel,
  onDismiss,
}: Props) {
  const [hole, setHole] = useState<Rect | null>(null);
  const [card, setCard] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    const target = document.getElementById(targetId);
    if (!target) {
      setHole(null);
      setCard(null);
      return;
    }
    const box = target.getBoundingClientRect();
    const nextHole: Rect = {
      top: box.top - HOLE_PADDING,
      left: box.left - HOLE_PADDING,
      width: box.width + HOLE_PADDING * 2,
      height: box.height + HOLE_PADDING * 2,
    };
    setHole(nextHole);

    const width = Math.min(CARD_WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.min(
      Math.max(nextHole.left, EDGE),
      window.innerWidth - width - EDGE,
    );
    const below = nextHole.top + nextHole.height + CARD_GAP;
    const fitsBelow = below + 150 <= window.innerHeight;
    setCard({
      top: fitsBelow ? below : Math.max(EDGE, nextHole.top - 150 - CARD_GAP),
      left,
      width,
      height: 0,
    });
  }, [targetId]);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
    measure();
  }, [targetId, measure]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const target = document.getElementById(targetId);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (target && observer) observer.observe(target);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const settle = window.setTimeout(schedule, 400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [targetId, measure]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    function onPointerDown(event: PointerEvent) {
      const node = event.target;
      if (!(node instanceof Element)) return;
      const target = document.getElementById(targetId);
      if (target && (node === target || target.contains(node))) return;
      if (node.closest(".classroom-first-run-card")) return;
      onDismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onDismiss, targetId]);

  if (!hole || !card) return null;

  return (
    <div className="classroom-first-run" role="dialog" aria-label={message}>
      <div
        className="classroom-first-run-hole"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
        }}
      />
      <div
        className="classroom-first-run-card"
        style={{ top: card.top, left: card.left, width: card.width }}
      >
        <p className="classroom-first-run-message">{message}</p>
        <div className="classroom-first-run-actions">
          <a className="classroom-first-run-cta" href={actionHref}>
            {actionLabel}
          </a>
          <button
            type="button"
            className="classroom-first-run-close"
            onClick={onDismiss}
            aria-label="안내 닫기"
            title="안내 닫기"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
