"use client";

import Link from "next/link";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

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
  const topLinkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const closeTimerRef = useRef<number | null>(null);
  const pendingPanelFocusRef = useRef(false);
  const restoringFocusRef = useRef(false);
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

  function enabledPanelLinks() {
    return Array.from(
      rootRef.current?.querySelectorAll<HTMLAnchorElement>(
        ".mega-nav-panel a.mega-nav-link",
      ) ?? [],
    );
  }

  function focusTopLink(index: number) {
    const count = items.length;
    if (count === 0) return;
    topLinkRefs.current[(index + count) % count]?.focus();
  }

  function onTopLinkKeyDown(
    event: ReactKeyboardEvent<HTMLAnchorElement>,
    index: number,
    item: MegaNavItem,
    hasPanel: boolean,
  ) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTopLink(index - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTopLink(index + 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusTopLink(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusTopLink(items.length - 1);
      return;
    }

    if (
      event.key === "ArrowDown" &&
      hasPanel &&
      item.groups.some((group) => group.links.some((link) => !link.disabled))
    ) {
      event.preventDefault();
      const firstPanelLink =
        event.currentTarget.getAttribute("aria-expanded") === "true"
          ? enabledPanelLinks()[0]
          : undefined;
      if (firstPanelLink) {
        firstPanelLink.focus();
      } else {
        pendingPanelFocusRef.current = true;
        openItem(item.id);
      }
    }
  }

  function onPanelLinkKeyDown(event: ReactKeyboardEvent<HTMLAnchorElement>) {
    const links = enabledPanelLinks();
    const currentIndex = links.indexOf(event.currentTarget);
    if (currentIndex < 0 || links.length === 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % links.length;
    if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + links.length) % links.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = links.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      links[nextIndex]?.focus();
    }
  }

  useEffect(() => {
    if (!activeId) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        const triggerIndex = items.findIndex((item) => item.id === activeId);
        restoringFocusRef.current = true;
        closeNow();
        topLinkRefs.current[triggerIndex]?.focus();
        restoringFocusRef.current = false;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId, items]);

  useEffect(() => {
    if (!activeId || !pendingPanelFocusRef.current) return;
    pendingPanelFocusRef.current = false;
    enabledPanelLinks()[0]?.focus();
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
        {items.map((item, index) => {
          const hasPanel = item.groups.some((group) => group.links.length > 0);
          const isOpen = activeItem?.id === item.id;

          return (
            <Link
              ref={(node) => {
                topLinkRefs.current[index] = node;
              }}
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
                if (hasPanel && !restoringFocusRef.current) openItem(item.id);
              }}
              onKeyDown={(event) =>
                onTopLinkKeyDown(event, index, item, hasPanel)
              }
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
                            onKeyDown={onPanelLinkKeyDown}
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
