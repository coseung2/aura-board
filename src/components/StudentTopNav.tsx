"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  showDevFeatures?: boolean;
};

export function StudentTopNav({
  studentName,
  classroomName,
  duties = [],
  showDevFeatures = false,
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const dutyLinks = duties.map((duty) => ({
    href: duty.href,
    label: duty.roleLabel,
    active: pathname.startsWith(duty.href),
    emoji: duty.emoji,
  }));

  const characterActive =
    pathname === "/student/reading-champions" ||
    pathname === "/student/character-town" ||
    pathname === "/student/character-room" ||
    pathname === "/student/character-shop";
  const readingRecordActive =
    pathname === "/student/reading" || pathname.startsWith("/student/reading/");
  const readingChampionsActive = pathname.startsWith("/student/reading-champions");
  const readingActive = readingRecordActive || readingChampionsActive;
  const walkingActive = pathname.startsWith("/student/walking");

  const navItems: MegaNavItem[] = [
    {
      id: "boards",
      label: "보드",
      href: "/student",
      active: pathname === "/student",
      groups: [
        {
          title: "학습",
          links: [
            { href: "/student", label: "보드", active: pathname === "/student" },
            {
              href: "/student/portfolio",
              label: "포트폴리오",
              active: pathname.startsWith("/student/portfolio"),
            },
            {
              href: "/student/reading",
              label: "독서 기록",
              active: readingRecordActive,
            },
            {
              href: "/student/reading-champions",
              label: "독서왕 전시",
              active: readingChampionsActive,
            },
          ],
        },
        {
          title: "활동",
          links: [
            {
              href: "/student/walking",
              label: "걷기 기록",
              active: walkingActive,
            },
            {
              href: "/student/canva-pair",
              label: "캔바 연결",
              active: pathname.startsWith("/student/canva-pair"),
            },
          ],
        },
        ...(dutyLinks.length > 0
          ? [{ title: "내 역할", links: dutyLinks }]
          : []),
      ],
    },
    {
      id: "portfolio",
      label: "포트폴리오",
      href: "/student/portfolio",
      active: pathname.startsWith("/student/portfolio"),
      groups: [
        {
          title: "작품",
          links: [
            {
              href: "/student/portfolio",
              label: "포트폴리오",
              active: pathname.startsWith("/student/portfolio"),
            },
          ],
        },
      ],
    },
    {
      id: "character",
      label: "독서왕",
      href: "/student/reading-champions",
      active: characterActive,
      groups: [
        {
          title: "캐릭터",
          links: [
            {
              href: "/student/reading-champions",
              label: "독서왕 전시",
              active:
                readingChampionsActive ||
                pathname === "/student/character-town",
            },
            {
              href: "/student/character-room",
              label: "피팅룸",
              active: pathname === "/student/character-room",
            },
            {
              href: "/student/character-shop",
              label: "상점",
              active: pathname === "/student/character-shop",
            },
          ],
        },
      ],
    },
    {
      id: "walking",
      label: "걷기",
      href: "/student/walking",
      active: walkingActive,
      groups: [
        {
          title: "건강",
          links: [
            {
              href: "/student/walking",
              label: "걷기 기록",
              active: walkingActive,
            },
          ],
        },
      ],
    },
    {
      id: "wallet",
      label: "통장",
      href: "/my/wallet",
      active: pathname.startsWith("/my/wallet"),
      groups: [
        {
          title: "내 것",
          links: [
            {
              href: "/my/wallet",
              label: "통장",
              active: pathname.startsWith("/my/wallet"),
            },
          ],
        },
      ],
    },
    {
      id: "reading",
      label: "독서",
      href: "/student/reading",
      active: readingActive,
      groups: [
        {
          title: "학습",
          links: [
            {
              href: "/student/reading",
              label: "독서 기록",
              active: readingRecordActive,
            },
            {
              href: "/student/reading-champions",
              label: "독서왕 전시",
              active: readingChampionsActive,
            },
          ],
        },
      ],
    },
    {
      id: "canva",
      label: "Canva",
      href: "/student/canva-pair",
      active: pathname.startsWith("/student/canva-pair"),
      groups: [
        {
          title: "활동",
          links: [
            {
              href: "/student/canva-pair",
              label: "Canva 연결",
              active: pathname.startsWith("/student/canva-pair"),
            },
          ],
        },
      ],
    },
    ...duties.map((duty) => ({
      id: `duty-${duty.classroomId}-${duty.roleKey}`,
      label: duty.roleLabel,
      href: duty.href,
      active: pathname.startsWith(duty.href),
      groups: [
        {
          title: duty.classroomName,
          links: [
            {
              href: duty.href,
              label: duty.roleLabel,
              active: pathname.startsWith(duty.href),
              emoji: duty.emoji,
            },
          ],
        },
      ],
    })),
  ];
  const visibleNavItems = showDevFeatures
    ? navItems
    : navItems
        .filter((item) => item.id !== "character")
        .map((item) => ({
          ...item,
          groups: item.groups.map((group) => ({
            ...group,
            links: group.links.filter((link) => !isDevFeatureHref(link.href)),
          })),
        }));

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
        <Link href="/student" className="student-topnav-logo" aria-label="학생 홈">
          <Logo size={32} withWordmark />
        </Link>

        <MegaNav items={visibleNavItems} ariaLabel="학생 메뉴" />
      </div>

      <div className="student-topnav-right auth-header">
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

function isDevFeatureHref(href: string): boolean {
  return (
    href === "/student/reading-champions" ||
    href === "/student/character-town" ||
    href === "/student/character-room" ||
    href === "/student/character-shop"
  );
}
