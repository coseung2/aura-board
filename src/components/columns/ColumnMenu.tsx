"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "../ContextMenu";

export type SortMode = "manual" | "newest" | "oldest" | "title";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "manual", label: "수동" },
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된 순" },
  { value: "title", label: "제목순" },
];

type Props = {
  sortMode: SortMode;
  canSort: boolean;
  onSetSort: (mode: SortMode) => void;
  /** Non-sort actions (rename, clear, delete, …). Rendered after sort section. */
  actions?: MenuItem[];
  triggerTitle?: string;
};

/**
 * Column-header kebab menu — handoff ColumnsBoardPage ColumnMenu (T5-1).
 * Keeps ContextMenu's trigger/dropdown shell but adds a sort radio group
 * so teachers can switch per-column ordering without a separate <select>.
 */
export function ColumnMenu({
  sortMode,
  canSort,
  onSetSort,
  actions = [],
  triggerTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function recompute() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  const showSortSection = canSort;

  const dropdown =
    open && pos ? (
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
        {showSortSection && (
          <>
            <div className="ctx-menu-label">정렬</div>
            {SORT_OPTIONS.map((o) => {
              const selected = sortMode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`ctx-menu-item ctx-menu-item-radio${selected ? " is-selected" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onSetSort(o.value);
                  }}
                >
                  <span className="ctx-menu-check" aria-hidden="true">
                    {selected ? "✓" : ""}
                  </span>
                  {o.label}
                </button>
              );
            })}
            {actions.length > 0 && <div className="ctx-menu-sep" />}
          </>
        )}
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`ctx-menu-item${a.danger ? " ctx-menu-item-danger" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              a.onClick();
            }}
          >
            {a.icon && <span className="ctx-menu-icon">{a.icon}</span>}
            {a.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="ctx-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="ctx-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerTitle ?? "섹션 메뉴"}
        title={triggerTitle ?? "섹션 메뉴"}
      >
        ⋯
      </button>
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
