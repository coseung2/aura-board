"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CreateBoardModal } from "./CreateBoardModal";
import { EditBoardModal } from "./EditBoardModal";
import { GameHubCatalog } from "./game-platform/GameHubCatalog";
import { layoutLabel, layoutThumbnail } from "@/lib/layout-meta";
import { GAME_HUB_ORDER } from "@/lib/game-platform/catalog";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

type BoardItem = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  thumbnailMode: string | null;
  thumbnailUrl: string | null;
  classroomId: string | null;
  category: "LESSON" | "PLAY";
  cardCount: number;
  memberCount: number;
  role: string;
};

type ClassroomItem = {
  id: string;
  name: string;
  studentCount: number;
};

type Props = {
  boards: BoardItem[];
  classrooms: ClassroomItem[];
  userTier?: "free" | "pro";
  isAdmin?: boolean;
};

type BoardGridProps = {
  boards: BoardItem[];
  showCreate?: boolean;
  onCreate: () => void;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: (board: BoardItem) => void;
  onDuplicate: (boardId: string) => void;
  onDelete: (boardId: string) => void;
};

function BoardGrid({
  boards,
  showCreate = false,
  onCreate,
  menuOpen,
  setMenuOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: BoardGridProps) {
  return (
    <div className="board-grid">
      {showCreate ? (
        <button
          type="button"
          className="board-grid-card board-grid-new"
          onClick={onCreate}
        >
          <div className="board-grid-preview board-grid-new-preview">
            <div className="board-grid-new-icon">+</div>
          </div>
          <div className="board-grid-info">
            <span className="board-grid-title board-grid-new-label">
              새 보드 만들기
            </span>
            <span className="board-grid-meta">수업 보드 추가</span>
          </div>
        </button>
      ) : null}
      {boards.map((board) => {
        const thumbnail =
          board.thumbnailMode === "custom" && board.thumbnailUrl
            ? board.thumbnailUrl
            : (layoutThumbnail(board.layout) ?? FALLBACK_THUMBNAIL);

        return (
          <div
            key={board.id}
            className={`board-grid-card${
              menuOpen === board.id ? " board-grid-card--menu-open" : ""
            }`}
          >
            <Link href={`/board/${board.slug}`} className="board-grid-card-link">
              <div className="board-grid-preview">
                <img
                  className="board-grid-preview-img"
                  src={thumbnail}
                  alt={`${layoutLabel(board.layout)} 화면 미리보기`}
                />
              </div>
              <div className="board-grid-info">
                <div className="board-grid-title">{board.title}</div>
                <div className="board-grid-meta">{layoutLabel(board.layout)}</div>
              </div>
            </Link>
            {board.role === "owner" ? (
              <button
                type="button"
                className="board-grid-kebab"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen(menuOpen === board.id ? null : board.id);
                }}
                title="보드 관리"
                aria-label={`${board.title} 관리 메뉴 열기`}
              >
                ···
              </button>
            ) : null}
            {menuOpen === board.id ? (
              <div className="board-grid-kebab-menu" role="menu">
                <button
                  type="button"
                  className="board-grid-kebab-item"
                  role="menuitem"
                  onClick={() => {
                    onEdit(board);
                    setMenuOpen(null);
                  }}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="board-grid-kebab-item"
                  role="menuitem"
                  onClick={() => onDuplicate(board.id)}
                >
                  복제
                </button>
                <button
                  type="button"
                  className="board-grid-kebab-item board-grid-kebab-item--danger"
                  role="menuitem"
                  onClick={() => onDelete(board.id)}
                >
                  삭제
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type BoardSectionTabsProps = BoardGridProps & {
  classrooms: ClassroomItem[];
  isAdmin: boolean;
};

function BoardSectionTabs({
  boards,
  classrooms,
  onCreate,
  menuOpen,
  setMenuOpen,
  onEdit,
  onDuplicate,
  onDelete,
  isAdmin,
}: BoardSectionTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCategory =
    (isAdmin && searchParams.get("category") === "play") ||
    (isAdmin && !boards.some((board) => board.category === "LESSON"))
      ? "PLAY"
      : "LESSON";
  const [activeCategory, setActiveCategory] =
    useState<"LESSON" | "PLAY">(requestedCategory);

  const lessonBoards = useMemo(
    () => boards.filter((board) => board.category === "LESSON"),
    [boards],
  );
  const playEntryCount = GAME_HUB_ORDER.length + 1;

  useEffect(() => {
    setActiveCategory(requestedCategory);
  }, [requestedCategory]);

  function selectCategory(category: "LESSON" | "PLAY") {
    setActiveCategory(category);
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (category === "PLAY") nextSearchParams.set("category", "play");
    else nextSearchParams.delete("category");
    const query = nextSearchParams.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard", {
      scroll: false,
    });
  }

  return (
    <>
      <div className="board-section-tabs" role="tablist" aria-label="보드 구분">
        <div className="board-section-tabs-list">
          <button
            type="button"
            role="tab"
            id="teacher-board-tab-lesson"
            aria-controls="teacher-board-panel"
            aria-selected={activeCategory === "LESSON"}
            tabIndex={activeCategory === "LESSON" ? 0 : -1}
            className={`board-section-tab ${
              activeCategory === "LESSON" ? "is-active" : ""
            }`}
            onClick={() => selectCategory("LESSON")}
          >
            수업
            <span className="board-section-tab-count">{lessonBoards.length}</span>
          </button>
          {isAdmin ? (
            <button
              type="button"
              role="tab"
              id="teacher-board-tab-play"
              aria-controls="teacher-board-panel"
              aria-selected={activeCategory === "PLAY"}
              tabIndex={activeCategory === "PLAY" ? 0 : -1}
              className={`board-section-tab ${
                activeCategory === "PLAY" ? "is-active" : ""
              }`}
              onClick={() => selectCategory("PLAY")}
            >
              놀이
              <span className="board-section-tab-count">{playEntryCount}</span>
            </button>
          ) : null}
        </div>
      </div>

      <section
        id="teacher-board-panel"
        className={activeCategory === "PLAY" ? "teacher-play-panel" : undefined}
        role="tabpanel"
        aria-labelledby={
          activeCategory === "PLAY"
            ? "teacher-board-tab-play"
            : "teacher-board-tab-lesson"
        }
      >
        {isAdmin && activeCategory === "PLAY" ? (
          <GameHubCatalog viewer="teacher" classrooms={classrooms} />
        ) : (
          <BoardGrid
            boards={lessonBoards}
            showCreate
            onCreate={onCreate}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )}
      </section>
    </>
  );
}

export function Dashboard({
  boards,
  classrooms,
  userTier = "pro",
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingBoard, setEditingBoard] = useState<BoardItem | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  async function handleDelete(boardId: string) {
    if (!confirm("이 보드를 삭제하시겠습니까? 모든 카드가 함께 삭제됩니다.")) {
      return;
    }
    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.refresh();
      } else {
        alert(`삭제 실패: ${await response.text()}`);
      }
    } catch (error) {
      console.error(error);
    }
    setMenuOpen(null);
  }

  async function handleDuplicate(boardId: string) {
    try {
      const response = await fetch(`/api/boards/${boardId}/duplicate`, {
        method: "POST",
      });
      if (response.ok) {
        router.refresh();
      } else {
        alert(`복제 실패: ${await response.text()}`);
      }
    } catch (error) {
      console.error(error);
    }
    setMenuOpen(null);
  }

  return (
    <>
      <BoardSectionTabs
        boards={boards}
        classrooms={classrooms}
        onCreate={() => setShowCreate(true)}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onEdit={setEditingBoard}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        isAdmin={isAdmin}
      />

      {menuOpen ? (
        <button
          type="button"
          className="board-menu-backdrop"
          onClick={() => setMenuOpen(null)}
          aria-label="보드 관리 메뉴 닫기"
        />
      ) : null}

      {showCreate ? (
        <CreateBoardModal
          classrooms={classrooms}
          userTier={userTier}
          isAdmin={isAdmin}
          onClose={() => setShowCreate(false)}
        />
      ) : null}
      {editingBoard ? (
        <EditBoardModal
          board={editingBoard}
          classrooms={classrooms}
          onClose={() => setEditingBoard(null)}
        />
      ) : null}
    </>
  );
}
