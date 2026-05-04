"use client";

import { useEffect, useId, useRef } from "react";

/**
 * SidePanel — generic right-side slide-over dialog.
 *
 * a11y:
 *  - role=dialog + aria-modal=true
 *  - aria-labelledby points at an internal title node (or external via labelledBy)
 *  - ESC closes
 *  - focus trap: Tab/Shift+Tab cycles within the panel
 *  - body scroll lock while open
 *  - backdrop button closes on click, keyboard-reachable
 *
 * Responsive:
 *  - >=768px: right-fixed 420px column
 *  - <768px: bottom sheet (handled in side-panel.css)
 */
export type SidePanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** If provided, overrides the internal title element for aria-labelledby. */
  labelledBy?: string;
  children: React.ReactNode;
  /** Desktop width in px, default 420. */
  width?: number;
  /** Focus this element when the panel opens. Falls back to the close button. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Optional footer slot rendered below body (reserved; current callers unused). */
  footer?: React.ReactNode;
  /** Extra class on the scroll body. */
  className?: string;
};

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null);
}

export function SidePanel({
  open,
  onClose,
  title,
  labelledBy,
  children,
  width = 420,
  initialFocusRef,
  footer,
  className,
}: SidePanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const internalTitleId = useId();
  const titleId = labelledBy ?? internalTitleId;

  // Track opener to restore focus on close.
  useEffect(() => {
    if (open) {
      openerRef.current = (document.activeElement as HTMLElement) ?? null;
    } else if (openerRef.current) {
      const opener = openerRef.current;
      // Defer so the close-caller's own focus calls don't lose the race.
      queueMicrotask(() => {
        try {
          opener.focus({ preventScroll: true });
        } catch {
          /* noop */
        }
      });
      openerRef.current = null;
    }
  }, [open]);

  // Scroll lock + initial focus + key handlers.
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Initial focus.
    const focusTarget = initialFocusRef?.current ?? closeBtnRef.current;
    focusTarget?.focus({ preventScroll: true });

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = getFocusableElements(panelRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, initialFocusRef, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="side-panel-backdrop"
        aria-label="닫기"
        onClick={onClose}
      />
      <aside
        ref={(el) => {
          panelRef.current = el;
        }}
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-open="true"
        style={{ width }}
      >
        <div className="side-panel-head">
          {!labelledBy && (
            <h2 id={internalTitleId} className="side-panel-title">
              {title}
            </h2>
          )}
          <button
            ref={closeBtnRef}
            type="button"
            className="side-panel-close"
            aria-label="닫기"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className={`side-panel-body ${className ?? ""}`.trim()}>{children}</div>
        {footer ? <div className="side-panel-footer">{footer}</div> : null}
      </aside>
    </>
  );
}
