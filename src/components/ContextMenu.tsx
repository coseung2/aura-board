"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export type MenuItem = {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick: () => void;
};

type Props = {
  items: MenuItem[];
};

// context-menu-stacking (2026-04-26): 드롭다운이 카드 stacking context 안에
// 갇혀 아래 카드에 가려지는 문제 → trigger 버튼 rect 를 측정해 fixed 위치
// 계산하고 createPortal 로 document.body 에 마운트. 어떤 부모 z-index 와도
// 무관하게 항상 최상단에 그려지고 클릭됨.

export function ContextMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Outside-click close — both trigger and dropdown 영역은 제외.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 스크롤·리사이즈 시 위치 재계산. 열린 상태에서만 비용 발생.
  useEffect(() => {
    if (!open) return;
    function recompute() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Default: dropdown opens BELOW the trigger (right-aligned). When
      // the trigger sits near the bottom of the viewport the dropdown
      // would otherwise spill past the window edge and get clipped by
      // any ancestor overflow:hidden (or simply by the viewport itself).
      // Flip to above the trigger in that case.
      //
      // The dropdown height isn't known until it has mounted, so we
      // measure it via dropdownRef on the first frame and again on
      // scroll/resize. Until we have a measurement we default to the
      // below position; the next recompute pass will flip if needed.
      const ddHeight = dropdownRef.current?.offsetHeight ?? 0;
      const margin = 8;
      const below = r.bottom + 4;
      const wouldOverflow = below + ddHeight + margin > window.innerHeight;
      const top = wouldOverflow
        ? Math.max(margin, r.top - 4 - ddHeight)
        : below;
      // 드롭다운 우측 정렬: 메뉴 right 엣지를 트리거 right 엣지에 맞춤.
      // transform: translateX(-100%) 를 쓰면 menuIn 키프레임의 transform 이
      // 그걸 덮어써서 애니메이션 중 좌→우 점프 플리커가 발생 — 그래서 위치를
      // 순수 right 오프셋으로 잡는다.
      setPos({ top, right: window.innerWidth - r.right });
    }
    recompute();
    // Re-measure after the dropdown has had a frame to paint, so
    // ddHeight in recompute() is the real value rather than 0.
    const raf = requestAnimationFrame(recompute);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen((o) => !o);
  }

  return (
    <div className="ctx-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="ctx-menu-trigger"
        onClick={toggle}
        aria-label="메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="ctx-menu-dropdown ctx-menu-dropdown-portal"
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`ctx-menu-item ${item.danger ? "ctx-menu-item-danger" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon && <span className="ctx-menu-icon">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
