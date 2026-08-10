"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { AuthHeader } from "./AuthHeader";
import { MegaNav, type MegaNavItem, type MegaNavLink } from "./MegaNav";

type Props = {
  showAdmin?: boolean;
};

type BoardCategory = "LESSON" | "PLAY" | string;

type TeacherNavBoard = {
  id: string;
  slug: string;
  title: string;
  category: BoardCategory;
  classroomId: string | null;
  updatedAt: string;
  layout?: string | null;
  systemGameKind?: string | null;
  pending?: boolean;
};

type TeacherNavClassroom = {
  id: string;
  name: string;
  boards: TeacherNavBoard[];
};

type TeacherNavData = {
  classrooms: TeacherNavClassroom[];
  boards: TeacherNavBoard[];
};

const EMPTY_NAV_DATA: TeacherNavData = {
  classrooms: [],
  boards: [],
};

const CLASSROOM_MANAGEMENT_TABS = [
  { key: "dashboard", label: "학급 홈" },
  { key: "students", label: "학생 명단" },
  { key: "groups", label: "자리·모둠" },
  { key: "boards", label: "보드 연결" },
] as const;

const CLASSROOM_OPERATION_TABS = [
  { key: "roles", label: "1인1역" },
  { key: "morning", label: "청소·당번" },
  { key: "assignments", label: "과제 현황" },
  { key: "check", label: "제출 체크" },
  { key: "bank", label: "금융 관리" },
  { key: "pay", label: "QR결제" },
  { key: "store", label: "매점" },
] as const;

const CLASSROOM_ACTIVITY_TABS = [
  { key: "portfolio", label: "포트폴리오" },
  { key: "reading", label: "독서" },
  { key: "walking", label: "걷기 현황" },
  { key: "daily-banners", label: "일일 배너" },
] as const;

function boardHref(board: TeacherNavBoard) {
  return `/board/${board.slug}`;
}

async function openTeacherPlayBoard(board: TeacherNavBoard) {
  if (!board.pending || !board.classroomId || !board.systemGameKind) {
    window.location.assign(boardHref(board));
    return;
  }
  const response = await fetch("/api/teacher/game-hub/entry", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      gameKind: board.systemGameKind,
      classroomId: board.classroomId,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { href?: string }
    | null;
  if (!response.ok || !body?.href) {
    throw new Error("play_board_entry_failed");
  }
  window.location.assign(body.href);
}

export function TopNav({ showAdmin = false }: Props) {
  const pathname = usePathname() ?? "";
  const [navData, setNavData] = useState<TeacherNavData>(EMPTY_NAV_DATA);
  const [navLoadError, setNavLoadError] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const navRequestRef = useRef<AbortController | null>(null);
  const [previewClassroomId, setPreviewClassroomId] = useState<string | null>(
    null,
  );

  const currentClassroomId =
    pathname.match(/^\/classroom\/([^/]+)/)?.[1] ?? null;
  const classroomBasePath = currentClassroomId
    ? `/classroom/${currentClassroomId}`
    : "/classroom";
  const classroomTabHref = (key: string) =>
    currentClassroomId ? `${classroomBasePath}/${key}` : "/classroom";
  const isClassroomTabActive = (key: string) => {
    if (!currentClassroomId) return false;
    const href = `${classroomBasePath}/${key}`;
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      (key === "dashboard" && pathname === classroomBasePath)
    );
  };

  const loadTeacherNav = useCallback(async () => {
    if (navRequestRef.current) return;

    const controller = new AbortController();
    navRequestRef.current = controller;
    setNavLoading(true);

    try {
      const response = await fetch("/api/nav/teacher", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Teacher navigation request failed");

      const data = (await response.json()) as TeacherNavData;
      if (!controller.signal.aborted) {
        setNavData({
          classrooms: Array.isArray(data.classrooms) ? data.classrooms : [],
          boards: Array.isArray(data.boards) ? data.boards : [],
        });
        setNavLoadError(false);
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        (!(error instanceof DOMException) || error.name !== "AbortError")
      ) {
        setNavLoadError(true);
      }
    } finally {
      if (navRequestRef.current === controller) {
        navRequestRef.current = null;
        if (!controller.signal.aborted) setNavLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTeacherNav();
    return () => {
      const activeRequest = navRequestRef.current;
      navRequestRef.current = null;
      activeRequest?.abort();
    };
  }, [loadTeacherNav]);

  useEffect(() => {
    if (currentClassroomId) {
      setPreviewClassroomId(currentClassroomId);
      return;
    }

    setPreviewClassroomId((previousId) => {
      if (navData.classrooms.some((classroom) => classroom.id === previousId)) {
        return previousId;
      }
      return navData.classrooms[0]?.id ?? null;
    });
  }, [currentClassroomId, navData.classrooms]);

  const previewClassroom =
    navData.classrooms.find(
      (classroom) => classroom.id === previewClassroomId,
    ) ??
    navData.classrooms[0] ??
    null;

  const previewClassroomLessonBoards = (previewClassroom?.boards ?? []).filter(
    (board) => board.category === "LESSON",
  );
  const previewClassroomPlayBoards = (previewClassroom?.boards ?? []).filter(
    (board) => board.category === "PLAY",
  );

  const classroomBoardHref = previewClassroom
    ? `/classroom/${previewClassroom.id}/boards`
    : "/classroom";
  const previewClassroomBasePath = previewClassroom
    ? `/classroom/${previewClassroom.id}`
    : "/classroom";
  const previewClassroomTabHref = (key: string) =>
    previewClassroom ? `${previewClassroomBasePath}/${key}` : "/classroom";
  const isPreviewClassroomTabActive = (key: string) =>
    previewClassroom?.id === currentClassroomId && isClassroomTabActive(key);

  const classroomLinks: MegaNavLink[] =
    navData.classrooms.length > 0
      ? navData.classrooms.map((classroom) => ({
          href: `/classroom/${classroom.id}/boards`,
          label: classroom.name,
          active:
            currentClassroomId === classroom.id ||
            previewClassroom?.id === classroom.id,
          onPreview: () => {
            setPreviewClassroomId(classroom.id);
          },
        }))
      : [
          {
            href: "/classroom",
            label: "학급을 먼저 만들어 주세요",
            disabled: true,
          },
        ];

  const classroomBoardLinks = (
    boards: TeacherNavBoard[],
    emptyLabel: string,
    options?: { playHub?: boolean },
  ): MegaNavLink[] =>
    boards.length > 0
      ? boards.slice(0, options?.playHub ? 8 : 7).map((board) => ({
          href: board.pending ? classroomBoardHref : boardHref(board),
          label: board.title,
          active: !board.pending && pathname === boardHref(board),
          onSelect: board.pending
            ? () => {
                void openTeacherPlayBoard(board).catch(() => {
                  window.location.assign("/dashboard?category=play");
                });
              }
            : undefined,
        }))
      : [
          {
            href: classroomBoardHref,
            label: previewClassroom ? emptyLabel : "학급을 선택해 주세요",
            disabled: true,
          },
        ];

  const lessonBoardLinks = classroomBoardLinks(
    previewClassroomLessonBoards,
    "수업보드 없음",
  );
  const playBoardLinks = classroomBoardLinks(
    previewClassroomPlayBoards,
    "놀이보드 없음",
    { playHub: true },
  );

  const classroomContextLinks: MegaNavLink[] =
    navData.classrooms.length > 0
      ? navData.classrooms.map((classroom) => ({
            href: `/classroom/${classroom.id}/dashboard`,
            label: classroom.name,
            active:
              currentClassroomId === classroom.id ||
              previewClassroom?.id === classroom.id,
            onPreview: () => {
              setPreviewClassroomId(classroom.id);
            },
          }))
      : [
          {
            href: "/classroom",
            label: "학급을 먼저 만들어 주세요",
            disabled: true,
          },
        ];

  const classroomTabLinks = (
    tabs: ReadonlyArray<{ key: string; label: string }>,
  ): MegaNavLink[] =>
    previewClassroom
      ? tabs.map((tab) => ({
        href: previewClassroomTabHref(tab.key),
        label: tab.label,
        active: isPreviewClassroomTabActive(tab.key),
      }))
      : [
          {
            href: "/classroom",
            label: "학급을 선택해 주세요",
            disabled: true,
          },
        ];

  const selectedClassroomManagementLinks = classroomTabLinks(
    CLASSROOM_MANAGEMENT_TABS,
  );
  const selectedClassroomOperationLinks = classroomTabLinks(
    CLASSROOM_OPERATION_TABS,
  );
  const selectedClassroomActivityLinks = classroomTabLinks(
    CLASSROOM_ACTIVITY_TABS,
  );

  const navItems: MegaNavItem[] = [
    {
      id: "dashboard",
      label: "보드",
      href: "/",
      active: pathname === "/" || pathname.startsWith("/board/"),
      groups: [
        {
          title: "학급 종류",
          links: classroomLinks,
        },
        {
          title: "수업보드",
          links: lessonBoardLinks,
        },
        {
          title: "놀이보드",
          links: playBoardLinks,
        },
      ],
    },
    {
      id: "classrooms",
      label: "학급",
      href: "/classroom",
      active: pathname.startsWith("/classroom"),
      groups: [
        {
          title: "학급 선택",
          links: classroomContextLinks,
        },
        {
          title: previewClassroom
            ? `${previewClassroom.name} 관리`
            : "학급 관리",
          links: selectedClassroomManagementLinks,
        },
        {
          title: "학급 운영",
          links: selectedClassroomOperationLinks,
        },
        {
          title: "활동·기록",
          links: selectedClassroomActivityLinks,
        },
      ],
    },
    {
      id: "community",
      label: "공유",
      href: "/teacher/share",
      active: pathname.startsWith("/teacher/share"),
      groups: [
        {
          title: "교사 공유",
          links: [
            {
              href: "/teacher/share",
              label: "공유 보드 둘러보기",
              active: pathname === "/teacher/share",
            },
            {
              href: "/teacher/share?view=mine",
              label: "내 보드 게시 관리",
              active: false,
            },
          ],
        },
      ],
    },
  ];

  if (showAdmin) {
    navItems.push({
      id: "admin",
      label: "관리자",
      href: "/admin",
      active: pathname.startsWith("/admin"),
      groups: [
        {
          title: "관리",
          links: [
            {
              href: "/admin",
              label: "관리자 홈",
              active: pathname === "/admin",
            },
            {
              href: "/admin/errors",
              label: "에러 로그",
              active: pathname.startsWith("/admin/errors"),
            },
            {
              href: "/admin/activity",
              label: "보드 활동",
              active: pathname.startsWith("/admin/activity"),
            },
            {
              href: "/admin/daily-banners",
              label: "일일 배너",
              active: pathname.startsWith("/admin/daily-banners"),
            },
            {
              href: "/teacher/settings",
              label: "교사 설정",
              active: pathname.startsWith("/teacher/settings"),
            },
          ],
        },
        {
          title: "운영",
          links: [
            {
              href: "/billing",
              label: "결제",
              active: pathname.startsWith("/billing"),
            },
            {
              href: "/support",
              label: "문의",
              active: pathname.startsWith("/support"),
            },
          ],
        },
        {
          title: "가이드",
          links: [
            {
              href: "/teacher/settings#llm",
              label: "AI 연결 가이드",
              active: pathname.startsWith("/teacher/settings#llm"),
            },
            {
              href: "/docs/canva-setup",
              label: "Canva 연결 가이드",
              active: pathname.startsWith("/docs/canva-setup"),
            },
          ],
        },
      ],
    });
  }

  return (
    <header className="ab-topnav">
      <div className="ab-topnav-left">
        <Link href="/dashboard" className="ab-topnav-logo" aria-label="Aura-board 홈">
          <Logo size={32} withWordmark />
        </Link>
        <MegaNav items={navItems} ariaLabel="주 메뉴" />
      </div>
      <div className="ab-topnav-right">
        {navLoadError ? (
          <div className="nav-action-status" role="alert">
            <span className="nav-action-status-message">메뉴 로드 실패</span>
            <button
              type="button"
              className="nav-action-retry"
              onClick={() => void loadTeacherNav()}
              disabled={navLoading}
            >
              {navLoading ? "시도 중…" : "다시 시도"}
            </button>
          </div>
        ) : null}
        <AuthHeader />
      </div>
    </header>
  );
}
