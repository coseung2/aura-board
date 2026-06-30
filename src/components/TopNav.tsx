"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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

const CLASSROOM_TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "students", label: "학생 명단" },
  { key: "groups", label: "자리 배치" },
  { key: "boards", label: "학급 보드" },
  { key: "roles", label: "학급 역할" },
  { key: "bank", label: "은행" },
  { key: "store", label: "매점" },
  { key: "pay", label: "QR결제" },
  { key: "check", label: "제출 체크" },
] as const;

function boardHref(board: TeacherNavBoard) {
  return `/board/${board.slug}`;
}

function readRecentBoardIds() {
  try {
    const raw = localStorage.getItem("lastVisitedBoards");
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
      .map(([boardId]) => boardId);
  } catch {
    return [];
  }
}

export function TopNav({ showAdmin = false }: Props) {
  const pathname = usePathname() ?? "";
  const [navData, setNavData] = useState<TeacherNavData>(EMPTY_NAV_DATA);
  const [recentBoardIds, setRecentBoardIds] = useState<string[]>([]);
  const [previewClassroomId, setPreviewClassroomId] = useState<string | null>(
    null,
  );
  const [previewCategory, setPreviewCategory] = useState<
    "ALL" | "LESSON" | "PLAY"
  >("ALL");

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

  useEffect(() => {
    let cancelled = false;

    async function loadTeacherNav() {
      try {
        const response = await fetch("/api/nav/teacher", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = (await response.json()) as TeacherNavData;
        if (!cancelled) {
          setNavData({
            classrooms: Array.isArray(data.classrooms) ? data.classrooms : [],
            boards: Array.isArray(data.boards) ? data.boards : [],
          });
        }
      } catch {
        if (!cancelled) setNavData(EMPTY_NAV_DATA);
      }
    }

    loadTeacherNav();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function refreshRecentBoards() {
      setRecentBoardIds(readRecentBoardIds());
    }

    refreshRecentBoards();
    window.addEventListener("storage", refreshRecentBoards);
    window.addEventListener("focus", refreshRecentBoards);
    return () => {
      window.removeEventListener("storage", refreshRecentBoards);
      window.removeEventListener("focus", refreshRecentBoards);
    };
  }, []);

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

  const boardById = useMemo(() => {
    return new Map(navData.boards.map((board) => [board.id, board]));
  }, [navData.boards]);

  const previewClassroom =
    navData.classrooms.find(
      (classroom) => classroom.id === previewClassroomId,
    ) ??
    navData.classrooms[0] ??
    null;

  const previewClassroomBoards = (previewClassroom?.boards ?? []).filter(
    (board) => previewCategory === "ALL" || board.category === previewCategory,
  );

  const recentBoards = recentBoardIds
    .map((boardId) => boardById.get(boardId))
    .filter((board): board is TeacherNavBoard => Boolean(board))
    .slice(0, 6);

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
            setPreviewCategory("ALL");
          },
        }))
      : [
          {
            href: "/classroom",
            label: "학급을 먼저 만들어 주세요",
            disabled: true,
          },
        ];

  const previewClassroomBoardLinks: MegaNavLink[] =
    previewClassroomBoards.length > 0
      ? previewClassroomBoards.slice(0, 7).map((board) => ({
          href: boardHref(board),
          label: board.title,
          active: pathname === boardHref(board),
        }))
      : [
          {
            href: classroomBoardHref,
            label: previewClassroom
              ? "이 학급에 연결된 보드 없음"
              : "학급을 선택해 주세요",
            disabled: true,
          },
        ];

  const recentBoardLinks: MegaNavLink[] =
    recentBoards.length > 0
      ? recentBoards.map((board) => ({
          href: boardHref(board),
          label: board.title,
          active: pathname === boardHref(board),
        }))
      : [
          {
            href: "/",
            label: "최근 이용 기록 없음",
            disabled: true,
          },
        ];

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
              setPreviewCategory("ALL");
            },
          }))
      : [
          {
            href: "/classroom",
            label: "학급을 먼저 만들어 주세요",
            disabled: true,
          },
        ];

  const selectedClassroomManagementLinks: MegaNavLink[] = previewClassroom
    ? CLASSROOM_TABS.slice(0, 4).map((tab) => ({
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

  const selectedClassroomOperationLinks: MegaNavLink[] = previewClassroom
    ? CLASSROOM_TABS.slice(4).map((tab) => ({
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
          title: "보드 종류",
          links: [
            {
              href: classroomBoardHref,
              label: "수업보드",
              active: previewCategory === "LESSON",
              onPreview: () => setPreviewCategory("LESSON"),
            },
            {
              href: classroomBoardHref,
              label: "놀이보드",
              active: previewCategory === "PLAY",
              onPreview: () => setPreviewCategory("PLAY"),
            },
          ],
        },
        {
          title: previewClassroom ? `${previewClassroom.name} 보드` : "학급 보드",
          links: previewClassroomBoardLinks,
        },
        {
          title: "최근 이용 보드",
          links: recentBoardLinks,
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
          title: "학급 종류",
          links: classroomContextLinks,
        },
        {
          title: previewClassroom
            ? `${previewClassroom.name} 관리`
            : "학급 관리",
          links: selectedClassroomManagementLinks,
        },
        {
          title: previewClassroom
            ? `${previewClassroom.name} 운영`
            : "학급 운영",
          links: selectedClassroomOperationLinks,
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
              href: "/docs/ai-setup",
              label: "AI 연결 가이드",
              active: pathname.startsWith("/docs/ai-setup"),
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
        <Link href="/" className="ab-topnav-logo" aria-label="Aura-board 홈">
          <Logo size={32} withWordmark />
        </Link>
        <MegaNav items={navItems} ariaLabel="주 메뉴" />
      </div>
      <div className="ab-topnav-right">
        <AuthHeader />
      </div>
    </header>
  );
}
