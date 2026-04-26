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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
      // 드롭다운이 트리거 우측 정렬, 아래로 4px 여백.
      setPos({ top: r.bottom + 4, left: r.right });
    }
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
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
              left: pos.left,
              transform: "translateX(-100%)",
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
