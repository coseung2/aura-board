"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ParentNotificationBell } from "@/components/parent/ParentNotificationBell";

type Props = {
  parent: { name: string; email: string };
  pendingNotificationCount?: number;
  canSwitchToTeacher?: boolean;
  teacherSwitchHref?: string;
};

type Destination = {
  href: "/parent/feed" | "/parent/home";
  label: "피드" | "홈";
  icon: "feed" | "home";
};

const DESTINATIONS: Destination[] = [
  { href: "/parent/feed", label: "피드", icon: "feed" },
  { href: "/parent/home", label: "홈", icon: "home" },
];

export function ParentTopNav({
  parent,
  pendingNotificationCount = 0,
  canSwitchToTeacher = false,
  teacherSwitchHref = "/login?from=/dashboard",
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/parent/logout", { method: "POST" });
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.replace("/login?role=parent&error=logged_out");
      router.refresh();
    } catch (error) {
      console.error("[ParentTopNav] logout failed", error);
      setLoggingOut(false);
    }
  }

  return (
    <>
      <header className="parent-topnav">
        <Link
          href="/parent/feed"
          className="parent-topnav-logo"
          aria-label="Aura Board 학부모 피드"
        >
          <Logo size={32} withWordmark />
        </Link>

        <nav className="parent-topnav-destinations" aria-label="학부모 주 메뉴">
          {DESTINATIONS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`parent-topnav-destination${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="parent-topnav-tools auth-header auth-header-flat">
          <Link
            href="/parent/account"
            className="parent-topnav-action parent-topnav-account"
            aria-label="계정"
            aria-current={
              pathname.startsWith("/parent/account") ? "page" : undefined
            }
            title={parent.email}
          >
            <ParentNavIcon name="account" />
            <span className="parent-topnav-account-name">{parent.name}</span>
          </Link>
          <ParentNotificationBell pendingCount={pendingNotificationCount} />
          {canSwitchToTeacher ? (
            <Link
              href={teacherSwitchHref}
              className="parent-topnav-action"
              aria-label="교사 화면으로 전환"
              title="교사 화면"
            >
              <ParentNavIcon name="teacher" />
            </Link>
          ) : null}
          <button
            type="button"
            className="parent-topnav-action"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label={loggingOut ? "로그아웃 중" : "로그아웃"}
            title="로그아웃"
          >
            <ParentNavIcon name="logout" />
          </button>
        </div>
      </header>

      <header className="parent-mobile-header">
        <Link
          href="/parent/feed"
          className="parent-mobile-brand"
          aria-label="Aura Board 학부모 피드"
        >
          <Logo size={30} withWordmark />
        </Link>
        <Link
          href="/parent/notifications"
          className="parent-mobile-header-action"
          aria-label={
            pendingNotificationCount > 0
              ? `알림 ${pendingNotificationCount}개`
              : "알림"
          }
        >
          <BellIcon />
          {pendingNotificationCount > 0 ? (
            <span className="parent-nav-badge">
              {Math.min(pendingNotificationCount, 99)}
            </span>
          ) : null}
        </Link>
      </header>

      <nav className="parent-bottom-nav" aria-label="학부모 주 메뉴">
        {DESTINATIONS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`parent-bottom-nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <ParentNavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function ParentNavIcon({
  name,
}: {
  name: "feed" | "home" | "account" | "teacher" | "logout";
}) {
  const paths: Record<typeof name, ReactNode> = {
    feed: (
      <>
        <rect width="20" height="6" x="2" y="4" rx="2" />
        <rect width="20" height="6" x="2" y="14" rx="2" />
      </>
    ),
    home: (
      <>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    teacher: (
      <>
        <path d="M3 5h18v12H3z" />
        <path d="M8 21h8M12 17v4" />
        <path d="m7 11 3-3 2 2 3-3 2 2" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H5v14h5" />
        <path d="M14 8l4 4-4 4M8 12h10" />
      </>
    ),
  };

  return (
    <svg className="parent-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="parent-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}
