"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type MegaNavLink = {
  href: string;
  label: string;
  active?: boolean;
  emoji?: string | null;
  disabled?: boolean;
  onPreview?: () => void;
};

export type MegaNavGroup = {
  title: string;
  links: MegaNavLink[];
};

export type MegaNavItem = {
  id: string;
  href: string;
  label: string;
  active?: boolean;
  groups: MegaNavGroup[];
};

type Props = {
  items: MegaNavItem[];
  ariaLabel: string;
};

export function MegaNav({ items, ariaLabel }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  function cancelClose() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function closeNow() {
    cancelClose();
    setActiveId(null);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveId(null);
      closeTimerRef.current = null;
    }, 220);
  }

  function openItem(id: string) {
    cancelClose();
    setActiveId(id);
  }

  useEffect(() => {
    if (!activeId) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNow();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId]);

  useEffect(() => {
    return () => cancelClose();
  }, []);

  const activeItem =
    items.find(
      (item) =>
        item.id === activeId &&
        item.groups.some((group) => group.links.length > 0)
    ) ?? null;

  return (
    <nav
      ref={rootRef}
      className="mega-nav"
      aria-label={ariaLabel}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          closeNow();
        }
      }}
    >
      <div className="mega-nav-bar">
        {items.map((item) => {
          const hasPanel = item.groups.some((group) => group.links.length > 0);
          const isOpen = activeItem?.id === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`mega-nav-toplink${item.active ? " active" : ""}${
                isOpen ? " is-open" : ""
              }`}
              aria-current={item.active ? "page" : undefined}
              aria-expanded={hasPanel ? isOpen : undefined}
              aria-controls={hasPanel ? panelId : undefined}
              onMouseEnter={() => {
                if (hasPanel) openItem(item.id);
              }}
              onFocus={() => {
                if (hasPanel) openItem(item.id);
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {activeItem && (
        <div
          id={panelId}
          className="mega-nav-panel"
          role="region"
          aria-label={`${activeItem.label} 메뉴`}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="mega-nav-panel-inner">
            {activeItem.groups.map((group) =>
              group.links.length === 0 ? null : (
                <section key={group.title} className="mega-nav-group">
                  <h3 className="mega-nav-group-title">{group.title}</h3>
                  <ul className="mega-nav-list">
                    {group.links.map((link) => {
                      const isActive = link.active ?? false;
                      if (link.disabled) {
                        return (
                          <li key={`${link.href}-${link.label}`}>
                            <span
                              className="mega-nav-link is-disabled"
                              aria-disabled="true"
                            >
                              {link.emoji ? (
                                <span
                                  className="mega-nav-link-icon"
                                  aria-hidden
                                >
                                  {link.emoji}
                                </span>
                              ) : null}
                              <span className="mega-nav-link-label">
                                {link.label}
                              </span>
                            </span>
                          </li>
                        );
                      }

                      return (
                        <li key={`${link.href}-${link.label}`}>
                          <Link
                            href={link.href}
                            className={`mega-nav-link${isActive ? " active" : ""}`}
                            aria-current={isActive ? "page" : undefined}
                            onMouseEnter={link.onPreview}
                            onFocus={link.onPreview}
                            onClick={closeNow}
                          >
                            {link.emoji ? (
                              <span className="mega-nav-link-icon" aria-hidden>
                                {link.emoji}
                              </span>
                            ) : null}
                            <span className="mega-nav-link-label">
                              {link.label}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
