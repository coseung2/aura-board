"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { MegaNav } from "@/components/MegaNav";
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

  const routeChildId = pathname.match(/^\/parent\/child\/([^/]+)/)?.[1] ?? null;
  const requestedChildId = searchParams.get("child") ?? routeChildId;
  const selectedChildId =
    childRows.find((child) => child.studentId === requestedChildId)?.studentId ??
    childRows[0]?.studentId ??
    "";

  const selectedChildLinks = selectedChildId
    ? [
        {
          href: `/parent/child/${selectedChildId}`,
          label: "홈",
          active: pathname === `/parent/child/${selectedChildId}`,
        },
        {
          href: `/parent/child/${selectedChildId}/portfolio`,
          label: "포트폴리오",
          active: pathname.startsWith(
            `/parent/child/${selectedChildId}/portfolio`
          ),
        },
        {
          href: `/parent/child/${selectedChildId}/assignments`,
          label: "과제",
          active: pathname.startsWith(
            `/parent/child/${selectedChildId}/assignments`
          ),
        },
        {
          href: `/parent/child/${selectedChildId}/drawing`,
          label: "그림",
          active: pathname.startsWith(
            `/parent/child/${selectedChildId}/drawing`
          ),
        },
        {
          href: `/parent/child/${selectedChildId}/plant`,
          label: "식물 관찰",
          active: pathname.startsWith(`/parent/child/${selectedChildId}/plant`),
        },
        {
          href: `/parent/child/${selectedChildId}/events`,
          label: "행사",
          active: pathname.startsWith(`/parent/child/${selectedChildId}/events`),
        },
        {
          href: `/parent/child/${selectedChildId}/breakout`,
          label: "모둠",
          active: pathname.startsWith(
            `/parent/child/${selectedChildId}/breakout`
          ),
        },
      ]
    : [];

  const navItems = [
    {
      id: "home",
      label: "홈",
      href: "/parent/home",
      active: pathname === "/parent/home" || pathname.startsWith("/parent/home"),
      groups: [
        {
          title: "자녀",
          links: [
            {
              href: "/parent/home",
              label: "홈",
              active:
                pathname === "/parent/home" ||
                pathname.startsWith("/parent/home"),
            },
            {
              href: "/parent/showcase",
              label: "자랑해요",
              active: pathname.startsWith("/parent/showcase"),
            },
          ],
        },
        ...(selectedChildLinks.length > 0
          ? [{ title: "선택한 자녀", links: selectedChildLinks }]
          : []),
        {
          title: "계정",
          links: [
            {
              href: "/parent/notifications",
              label: "알림",
              active: pathname.startsWith("/parent/notifications"),
            },
            {
              href: "/parent/account",
              label: "계정",
              active: pathname.startsWith("/parent/account"),
            },
            {
              href: "/parent/onboard/match/code",
              label: "자녀 추가",
              active: pathname.startsWith("/parent/onboard/match/code"),
            },
          ],
        },
      ],
    },
  ];

  function handleChildSelect(studentId: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, studentId);
    }
    if (pathname.startsWith("/parent/child/")) {
      const suffix = pathname.replace(/^\/parent\/child\/[^/]+/, "");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("child");
      const query = params.toString();
      const newPath = `/parent/child/${studentId}${suffix}${query ? `?${query}` : ""}`;
      router.replace(newPath, { scroll: false });
      return;
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

        <MegaNav items={navItems} ariaLabel="학부모 메뉴" />
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
            href="/dashboard"
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
