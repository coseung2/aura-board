"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import type { ChildRow } from "@/components/parent/ParentChildSelector";

type ParentInfo = {
  name: string;
  email: string;
};

type Props = {
  parent: ParentInfo;
  childRows?: ChildRow[];
  pendingNotificationCount?: number;
  canSwitchToTeacher?: boolean;
  teacherSwitchHref?: string;
};

type IconName = "home" | "bell" | "add" | "account" | "teacher" | "logout";

export function ParentTopNav({
  parent,
  pendingNotificationCount = 0,
  canSwitchToTeacher = false,
  teacherSwitchHref = "/login?from=/dashboard",
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const items = [
    {
      href: "/parent/home",
      label: "홈",
      icon: "home" as const,
      active: pathname.startsWith("/parent/home") || pathname.startsWith("/parent/child/"),
    },
    {
      href: "/parent/notifications",
      label: "알림",
      icon: "bell" as const,
      active: pathname.startsWith("/parent/notifications"),
      badge: pendingNotificationCount,
    },
    {
      href: "/parent/onboard/match/code",
      label: "자녀 추가",
      icon: "add" as const,
      active: pathname.startsWith("/parent/onboard/match/code"),
    },
    {
      href: "/parent/account",
      label: "계정",
      icon: "account" as const,
      active: pathname.startsWith("/parent/account"),
    },
  ];

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/parent/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      router.replace("/login");
    } catch (error) {
      console.error("[ParentTopNav] logout failed", error);
      setLoggingOut(false);
    }
  }

  return (
    <>
      <header className="parent-mobile-header">
        <Link href="/parent/home" className="parent-mobile-brand" aria-label="학부모 홈">
          <Logo size={30} withWordmark />
        </Link>
        <Link
          href="/parent/notifications"
          className="parent-mobile-header-action"
          aria-label={pendingNotificationCount > 0 ? `알림 ${pendingNotificationCount}개` : "알림"}
        >
          <ParentNavIcon name="bell" />
          {pendingNotificationCount > 0 ? (
            <span className="parent-nav-badge">{Math.min(pendingNotificationCount, 99)}</span>
          ) : null}
        </Link>
      </header>

      <aside className="parent-sidebar" aria-label="학부모 메뉴">
        <Link href="/parent/home" className="parent-sidebar-brand" aria-label="학부모 홈">
          <Logo size={34} withWordmark />
        </Link>

        <nav className="parent-sidebar-links">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`parent-sidebar-link${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
            >
              <span className="parent-sidebar-icon">
                <ParentNavIcon name={item.icon} />
                {item.badge ? (
                  <span className="parent-nav-badge">{Math.min(item.badge, 99)}</span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="parent-sidebar-footer">
          <div className="parent-sidebar-profile">
            <span className="parent-profile-avatar" aria-hidden>
              {parent.name.trim().slice(0, 1) || "학"}
            </span>
            <span className="parent-sidebar-profile-copy">
              <strong>{parent.name}</strong>
              <small title={parent.email}>{parent.email}</small>
            </span>
          </div>
          {canSwitchToTeacher ? (
            <Link href={teacherSwitchHref} className="parent-sidebar-link is-utility">
              <ParentNavIcon name="teacher" />
              <span>교사 화면</span>
            </Link>
          ) : null}
          <button
            type="button"
            className="parent-sidebar-link is-utility"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <ParentNavIcon name="logout" />
            <span>{loggingOut ? "로그아웃 중..." : "로그아웃"}</span>
          </button>
        </div>
      </aside>

      <nav className="parent-bottom-nav" aria-label="학부모 하단 메뉴">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`parent-bottom-nav-link${item.active ? " is-active" : ""}`}
            aria-current={item.active ? "page" : undefined}
          >
            <span className="parent-bottom-nav-icon">
              <ParentNavIcon name={item.icon} />
              {item.badge ? (
                <span className="parent-nav-badge">{Math.min(item.badge, 99)}</span>
              ) : null}
            </span>
            <span>{item.label === "자녀 추가" ? "추가" : item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

function ParentNavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8" /><path d="M5.5 9.7V21h13V9.7" /><path d="M9.5 21v-6.5h5V21" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    add: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    teacher: <><path d="M3 5h18v12H3z" /><path d="M8 21h8M12 17v4" /><path d="m7 11 3-3 2 2 3-3 2 2" /></>,
    logout: <><path d="M10 5H5v14h5" /><path d="M14 8l4 4-4 4M8 12h10" /></>,
  };
  return (
    <svg className="parent-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
