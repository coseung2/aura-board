"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import {
  ParentChildSelector,
  type ChildRow,
} from "@/components/parent/ParentChildSelector";
import { ParentNotificationBell } from "@/components/parent/ParentNotificationBell";

type ParentInfo = {
  name: string;
  email: string;
};

type Props = {
  parent: ParentInfo;
  childRows?: ChildRow[];
  pendingNotificationCount?: number;
  canSwitchToTeacher?: boolean;
};

const LS_KEY = "parent-dashboard-last-child";

export function ParentTopNav({
  parent,
  childRows = [],
  pendingNotificationCount = 0,
  canSwitchToTeacher = false,
}: Props) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const tabs = [
    {
      id: "home",
      label: "홈",
      href: "/parent/home",
      active: pathname === "/parent/home" || pathname.startsWith("/parent/home"),
    },
  ];
  const routeChildId = pathname.match(/^\/parent\/child\/([^/]+)/)?.[1] ?? null;
  const selectedChildId =
    searchParams.get("child") ??
    routeChildId ??
    childRows[0]?.studentId ??
    "";

  function handleChildSelect(studentId: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, studentId);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("child", studentId);
    router.replace(`/parent/home?${params.toString()}`, { scroll: false });
  }

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
    } catch (e) {
      console.error("[ParentTopNav] logout failed", e);
      setLoggingOut(false);
    }
  }

  return (
    <header className="parent-topnav">
      <div className="parent-topnav-left">
        <Link href="/parent/home" className="parent-topnav-logo" aria-label="학부모 홈">
          <Logo size={32} withWordmark />
        </Link>

        <nav className="parent-topnav-links" aria-label="학부모 메뉴">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`parent-topnav-link${tab.active ? " active" : ""}`}
              aria-current={tab.active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="parent-topnav-tools">
        {childRows.length > 0 && (
          <ParentChildSelector
            children={childRows}
            selectedId={selectedChildId}
            onSelect={handleChildSelect}
            showAddChildLink={false}
          />
        )}
        <Link
          href="/parent/onboard/match/code"
          className="parent-topnav-action"
          aria-label="자녀 추가"
        >
          <span aria-hidden>➕</span>
          <span>자녀 추가</span>
        </Link>
      </div>

      <div className="parent-topnav-right auth-header">
        <span className="auth-name" title={parent.email}>
          {parent.name}
        </span>
        <ParentNotificationBell pendingCount={pendingNotificationCount} />
        {canSwitchToTeacher && (
          <Link
            href="/"
            className="auth-mode-switch"
            title="교사 화면으로 전환"
            aria-label="교사 화면으로 전환"
          >
            <span aria-hidden>👩‍🏫</span>
            <span>교사</span>
          </Link>
        )}
        <Link
          href="/parent/account"
          className={`auth-settings${
            pathname.startsWith("/parent/account") ? " is-active" : ""
          }`}
        >
          <span
            className="auth-settings-trigger"
            title="계정"
            aria-label="계정으로 이동"
          >
            ⚙️
          </span>
        </Link>
        <button
          type="button"
          className="auth-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="로그아웃"
          title={loggingOut ? "로그아웃 중..." : "로그아웃"}
        >
          <svg
            className="auth-logout-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M10 6H6.8A1.8 1.8 0 0 0 5 7.8v8.4A1.8 1.8 0 0 0 6.8 18H10" />
            <path d="M14 8l4 4-4 4" />
            <path d="M8.5 12H18" />
          </svg>
        </button>
      </div>
    </header>
  );
}

