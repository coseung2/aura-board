"use client";

import { useState } from "react";
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

export function Dashboard({ boards, classrooms, userTier = "pro" }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editingBoard, setEditingBoard] = useState<BoardItem | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  async function handleDelete(boardId: string) {
    if (!confirm("이 보드를 삭제하시겠습니까? 모든 카드가 함께 삭제됩니다.")) return;
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
      <div className="dashboard-classroom-row">
        <a href="/classroom" className="dashboard-classroom-link">학급 관리 →</a>
      </div>
      <div className="board-grid">
        {/* New board card — first position */}
        <button
          type="button"
          className="board-grid-card board-grid-new"
          onClick={() => setShowCreate(true)}
        >
          <div className="board-grid-new-icon">+</div>
          <span className="board-grid-new-label">새 보드 만들기</span>
        </button>

        {boards.map((b) => {
          const thumbnail =
            b.thumbnailMode === "custom" && b.thumbnailUrl
              ? b.thumbnailUrl
              : layoutThumbnail(b.layout) ?? FALLBACK_THUMBNAIL;

          return (
            <div
              key={b.id}
              className={`board-grid-card${menuOpen === b.id ? " board-grid-card--menu-open" : ""}`}
            >
              <Link
                href={`/board/${b.slug}`}
                className="board-grid-card-link"
              >
                <div className="board-grid-preview">
                  <img
                    className="board-grid-preview-img"
                    src={thumbnail}
                    alt={`${layoutLabel(b.layout)} 화면 미리보기`}
                  />
                </div>
                <div className="board-grid-title">{b.title}</div>
                <div className="board-grid-meta">
                  {layoutLabel(b.layout)}
                </div>
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
                    setEditingBoard(b);
                    setMenuOpen(null);
                  }}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="board-grid-kebab-item"
                  role="menuitem"
                  onClick={() => handleDuplicate(b.id)}
                >
                  복제
                </button>
                <button
                  type="button"
                  className="board-grid-kebab-item board-grid-kebab-item--danger"
                  role="menuitem"
                  onClick={() => handleDelete(b.id)}
                >
                  삭제
                </button>
              </div>
            )}
            </div>
          );
        })}
      </div>

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
