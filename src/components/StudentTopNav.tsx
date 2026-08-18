"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Logo } from "./Logo";
import { MegaNav, type MegaNavItem } from "./MegaNav";
import { StudentNotificationBell } from "./StudentNotificationBell";
import { parseStudentBoardCategory } from "./student/student-board-navigation";

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
  isAdminClassroom?: boolean;
};

function pathMatches(pathname: string, href: string) {
  const path = href.split("?", 1)[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function StudentTopNav({
  studentName,
  classroomName,
  duties = [],
  isAdminClassroom = false,
}: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const logoutRequestRef = useRef(false);

  const dutyLinks = duties.map((duty) => ({
    href: duty.href,
    label: `${duty.classroomName} · ${duty.roleLabel}`,
    active: pathMatches(pathname, duty.href),
    emoji: duty.emoji,
  }));

  const legacyBoard = searchParams.get("board");
  const rawBoardCategory = searchParams.get("category");
  const boardCategory = parseStudentBoardCategory(rawBoardCategory);
  const boardPlayTab = searchParams.get("playTab");
  const petSection = searchParams.get("section");

  const legacyLessonActive = pathname === "/student" && legacyBoard === "lesson";
  const legacyPlayActive =
    isAdminClassroom &&
    pathname === "/student" &&
    legacyBoard === "play" &&
    boardPlayTab !== "records";
  const legacyRecordsActive =
    isAdminClassroom &&
    pathname === "/student" &&
    legacyBoard === "play" &&
    boardPlayTab === "records";
  const boardsActive =
    pathMatches(pathname, "/student/boards") ||
    legacyLessonActive ||
    legacyPlayActive ||
    legacyRecordsActive;
  const homeActive = pathname === "/student" && !boardsActive;

  const lessonBoardActive =
    pathname === "/student/boards" && boardCategory === "lesson";
  const playBoardActive =
    isAdminClassroom &&
    pathname === "/student/boards" &&
    boardCategory === "play" &&
    boardPlayTab !== "records";
  const recordsBoardActive =
    isAdminClassroom &&
    pathname === "/student/boards" &&
    (rawBoardCategory === "records" ||
      (rawBoardCategory === "play" && boardPlayTab === "records"));

  const feedActive = pathMatches(pathname, "/student/feed");
  const petActive = pathMatches(pathname, "/student/aura-pet");
  const petMineActive =
    pathname === "/student/aura-pet" &&
    (petSection === null || petSection === "mine");
  const petClassroomActive =
    (pathname === "/student/aura-pet" && petSection === "classroom") ||
    pathMatches(pathname, "/student/aura-pet/classroom");
  const petShopActive =
    pathname === "/student/aura-pet" && petSection === "shop";

  const readingActive = pathMatches(pathname, "/student/reading");
  const walkingActive = pathMatches(pathname, "/student/walking");

  const walletActive = pathMatches(pathname, "/my/wallet");
  const portfolioActive = pathMatches(pathname, "/student/portfolio");
  const hiddenContentActive = pathMatches(pathname, "/student/hidden-content");
  const dutyActive = duties.some((duty) => pathMatches(pathname, duty.href));

  const navItems: MegaNavItem[] = [
    {
      id: "home",
      label: "홈",
      href: "/student",
      active: homeActive,
      groups: [],
    },
    ...(isAdminClassroom
      ? [
          {
            id: "feed",
            label: "피드",
            href: "/student/feed",
            active: feedActive,
            groups: [],
          },
        ]
      : []),
    {
      id: "boards",
      label: "보드",
      href: "/student/boards?category=lesson",
      active: boardsActive,
      groups: [
        {
          title: "보드",
          links: [
            {
              href: "/student/boards?category=lesson",
              label: "수업보드",
              active: lessonBoardActive || legacyLessonActive,
            },
            ...(isAdminClassroom
              ? [
                  {
                    href: "/student/boards?category=play",
                    label: "놀이보드",
                    active: playBoardActive || legacyPlayActive,
                  },
                  {
                    href: "/student/boards?category=records",
                    label: "나의 전적",
                    active: recordsBoardActive || legacyRecordsActive,
                  },
                ]
              : []),
          ],
        },
      ],
    },
    {
      id: "pet",
      label: "펫",
      href: "/student/aura-pet?section=mine",
      active: petActive,
      groups: [
        {
          title: "펫",
          links: [
            {
              href: "/student/aura-pet?section=mine",
              label: "내 펫",
              active: petMineActive,
            },
            {
              href: "/student/aura-pet?section=classroom",
              label: "우리 반 펫",
              active: petClassroomActive,
            },
            {
              href: "/student/aura-pet?section=shop",
              label: "상점",
              active: petShopActive,
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
      groups: [],
    },
    {
      id: "walking",
      label: "걷기",
      href: "/student/walking",
      active: walkingActive,
      groups: [],
    },
    {
      id: "more",
      label: "더보기",
      href: "/my/wallet",
      active:
        dutyActive || walletActive || portfolioActive || hiddenContentActive,
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
          title: "더보기",
          links: [
            { href: "/my/wallet", label: "은행", active: walletActive },
            {
              href: "/student/portfolio",
              label: "포트폴리오",
              active: portfolioActive,
            },
            {
              href: "/student/hidden-content",
              label: "숨긴 콘텐츠",
              active: hiddenContentActive,
            },
          ],
        },
      ],
    },
  ];

  async function handleLogout() {
    if (logoutRequestRef.current) return;

    logoutRequestRef.current = true;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/student/logout", { method: "POST" });
      if (!response.ok) throw new Error("Student logout request failed");

      setLogoutError(false);
      router.replace("/login");
    } catch {
      setLogoutError(true);
    } finally {
      logoutRequestRef.current = false;
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
        {logoutError ? (
          <div className="nav-action-status" role="alert">
            <span className="nav-action-status-message">로그아웃 실패</span>
            <button
              type="button"
              className="nav-action-retry"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
            >
              {loggingOut ? "시도 중…" : "다시 시도"}
            </button>
          </div>
        ) : null}
        <span className="auth-name" title={classroomName}>
          {studentName}
        </span>
        <StudentNotificationBell />
        <button
          type="button"
          className="auth-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label={logoutError ? "로그아웃 다시 시도" : "로그아웃"}
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
