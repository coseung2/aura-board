"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateBoardModal } from "./CreateBoardModal";
import { EditBoardModal } from "./EditBoardModal";
import { layoutLabel, layoutThumbnail } from "@/lib/layout-meta";

const FALLBACK_THUMBNAIL = "/board-type-thumbnails/card-board.png";

type BoardItem = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  thumbnailMode: string | null;
  thumbnailUrl: string | null;
  classroomId: string | null;
  // BC-1: "LESSON" or "PLAY". Drives the section split in the grid below.
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
};

type BoardSectionTabsProps = {
  boards: BoardItem[];
  onCreate: () => void;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: (board: BoardItem) => void;
  onDuplicate: (boardId: string) => void;
  onDelete: (boardId: string) => void;
};

function BoardSectionTabs({
  boards,
  onCreate,
  menuOpen,
  setMenuOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: BoardSectionTabsProps) {
  const [activeCategory, setActiveCategory] = useState<"LESSON" | "PLAY">(() =>
    boards.some((b) => b.category === "LESSON") ? "LESSON" : "PLAY",
  );

  const lessonBoards = useMemo(
    () => boards.filter((b) => b.category === "LESSON"),
    [boards],
  );
  const playBoards = useMemo(
    () => boards.filter((b) => b.category === "PLAY"),
    [boards],
  );
  const activeBoards = activeCategory === "LESSON" ? lessonBoards : playBoards;

  return (
    <>
      <div className="board-section-tabs" role="tablist" aria-label="보드 구분">
        <div className="board-section-tabs-list">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "LESSON"}
            className={`board-section-tab ${activeCategory === "LESSON" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("LESSON")}
          >
            수업
            <span className="board-section-tab-count">
              {lessonBoards.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "PLAY"}
            className={`board-section-tab ${activeCategory === "PLAY" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("PLAY")}
          >
            놀이
            <span className="board-section-tab-count">{playBoards.length}</span>
          </button>
        </div>
        <a href="/classroom" className="board-section-tabs-link">
          학급 관리 →
        </a>
      </div>

      <div className="board-grid">
        <button
          type="button"
          className="board-grid-card board-grid-new"
          onClick={onCreate}
        >
          <div className="board-grid-new-icon">+</div>
          <span className="board-grid-new-label">새 보드 만들기</span>
        </button>
        {activeBoards.map((b) => {
          const thumbnail =
            b.thumbnailMode === "custom" && b.thumbnailUrl
              ? b.thumbnailUrl
              : (layoutThumbnail(b.layout) ?? FALLBACK_THUMBNAIL);

          return (
            <div
              key={b.id}
              className={`board-grid-card${menuOpen === b.id ? " board-grid-card--menu-open" : ""}`}
            >
              <Link href={`/board/${b.slug}`} className="board-grid-card-link">
                <div className="board-grid-preview">
                  <img
                    className="board-grid-preview-img"
                    src={thumbnail}
                    alt={`${layoutLabel(b.layout)} 화면 미리보기`}
                  />
                </div>
                <div className="board-grid-title">{b.title}</div>
                <div className="board-grid-meta">{layoutLabel(b.layout)}</div>
              </Link>
              {b.role === "owner" && (
                <button
                  type="button"
                  className="board-grid-kebab"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(menuOpen === b.id ? null : b.id);
                  }}
                  title="보드 관리"
                  aria-label="보드 관리 메뉴 열기"
                >
                  ···
                </button>
              )}
              {menuOpen === b.id && (
                <div className="board-grid-kebab-menu" role="menu">
                  <button
                    type="button"
                    className="board-grid-kebab-item"
                    role="menuitem"
                    onClick={() => {
                      onEdit(b);
                      setMenuOpen(null);
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="board-grid-kebab-item"
                    role="menuitem"
                    onClick={() => onDuplicate(b.id)}
                  >
                    복제
                  </button>
                  <button
                    type="button"
                    className="board-grid-kebab-item board-grid-kebab-item--danger"
                    role="menuitem"
                    onClick={() => onDelete(b.id)}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Dashboard({ boards, classrooms, userTier = "pro" }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingBoard, setEditingBoard] = useState<BoardItem | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  async function handleDelete(boardId: string) {
    if (!confirm("이 보드를 삭제하시겠습니까? 모든 카드가 함께 삭제됩니다."))
      return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        alert(`삭제 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
    setMenuOpen(null);
  }

  async function handleDuplicate(boardId: string) {
    try {
      const res = await fetch(`/api/boards/${boardId}/duplicate`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert(`복제 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
    setMenuOpen(null);
  }

  return (
    <>
      {/* BC-1: section tabs for lesson vs play boards */}
      <BoardSectionTabs
        boards={boards}
        onCreate={() => setShowCreate(true)}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onEdit={setEditingBoard}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />

      {/* Close menu on backdrop click */}
      {menuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1 }}
          onClick={() => setMenuOpen(null)}
        />
      )}

      {showCreate && (
        <CreateBoardModal
          classrooms={classrooms}
          userTier={userTier}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editingBoard && (
        <EditBoardModal
          board={editingBoard}
          classrooms={classrooms}
          onClose={() => setEditingBoard(null)}
        />
      )}
    </>
  );
}
