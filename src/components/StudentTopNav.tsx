"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { MegaNav, type MegaNavItem } from "./MegaNav";
import { StudentNotificationBell } from "./StudentNotificationBell";

type Duty = {
  classroomId: string;
  classroomName: string;
  roleKey: string;
  roleLabel: string;
  emoji: string | null;
  href: string;
};

type Props = {
  studentName: string;
  classroomName: string;
  duties?: Duty[];
};

export function StudentTopNav({
  studentName,
  classroomName,
  duties = [],
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);

  const dutyLinks = duties.map((duty) => ({
    href: duty.href,
    label: `${duty.classroomName} · ${duty.roleLabel}`,
    active: pathname.startsWith(duty.href),
    emoji: duty.emoji,
  }));

  const readingRecordActive =
    pathname === "/student/reading" || pathname.startsWith("/student/reading/");
  const walkingActive = pathname.startsWith("/student/walking");
  const walletActive = pathname.startsWith("/my/wallet");
  const portfolioActive = pathname.startsWith("/student/portfolio");
  const dutyActive = duties.some((duty) => pathname.startsWith(duty.href));
  const boardTab = searchParams.get("board");

  const navItems: MegaNavItem[] = [
    {
      id: "boards",
      label: "보드",
      href: "/student?board=lesson",
      active: pathname === "/student",
      groups: [
        {
          title: "보드",
          links: [
            {
              href: "/student?board=lesson",
              label: "수업보드",
              active: pathname === "/student" && boardTab === "lesson",
            },
            {
              href: "/student?board=play",
              label: "놀이보드",
              active: pathname === "/student" && boardTab === "play",
            },
          ],
        },
      ],
    },
    {
      id: "life",
      label: "생활",
      href: dutyLinks[0]?.href ?? "/my/wallet",
      active: dutyActive || walletActive || portfolioActive,
      groups: [
        {
          title: "1인1역할",
          links:
            dutyLinks.length > 0
              ? dutyLinks
              : [
                  {
                    href: "/student",
                    label: "맡은 역할 없음",
                    disabled: true,
                  },
                ],
        },
        {
          title: "생활",
          links: [
            {
              href: "/my/wallet",
              label: "은행",
              active: walletActive,
            },
            {
              href: "/student/portfolio",
              label: "포트폴리오",
              active: portfolioActive,
            },
          ],
        },
      ],
    },
    {
      id: "self-directed",
      label: "자율활동",
      href: "/student/walking",
      active: walkingActive || readingRecordActive,
      groups: [
        {
          title: "자율활동",
          links: [
            {
              href: "/student/walking",
              label: "걷기",
              active: walkingActive,
            },
            {
              href: "/student/reading",
              label: "독서",
              active: readingRecordActive,
            },
          ],
        },
      ],
    },
    {
      id: "creatures",
      label: "펫",
      href: "/student/aura-pet",
      active: pathname.startsWith("/student/aura-pet"),
      groups: [
        {
          title: "펫",
          links: [
            {
              href: "/student/aura-pet",
              label: "펫",
              active: pathname.startsWith("/student/aura-pet"),
            },
          ],
        },
      ],
    },
  ];

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/student/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header className="student-topnav">
      <div className="student-topnav-left">
        <Link
          href="/student"
          className="student-topnav-logo"
          aria-label="학생 홈"
        >
          <Logo size={32} withWordmark />
        </Link>

        <MegaNav items={navItems} ariaLabel="학생 메뉴" />
      </div>

      <div className="student-topnav-right auth-header auth-header-flat">
        <span className="auth-name" title={classroomName}>
          {studentName}
        </span>
        <StudentNotificationBell />
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
