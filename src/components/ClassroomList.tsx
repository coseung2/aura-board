"use client";

import { useState } from "react";
import Link from "next/link";
import { CreateClassroomModal } from "./CreateClassroomModal";
import { ClassroomDeleteModal } from "./classroom/ClassroomDeleteModal";

type ClassroomItem = {
  id: string;
  name: string;
  code: string;
  _count: { students: number; boards: number };
};

type Props = {
  classrooms: ClassroomItem[];
  onRefresh: () => void;
};

export function ClassroomList({ classrooms, onRefresh }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassroomItem | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/classroom/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName: deleteTarget.name }),
      });
      if (res.ok) {
        setDeleteTarget(null);
        setMenuOpen(null);
        onRefresh();
      } else {
        const text = await res.text();
        alert(`학급 삭제 실패: ${text}`);
      }
    } catch (err) {
      console.error(err);
      alert("학급 삭제에 실패했습니다.");
    }
  }

  return (
    <>
      <div className="classroom-grid">
        {/* New classroom card */}
        <button
          type="button"
          className="classroom-grid-card classroom-grid-new"
          onClick={() => setShowCreate(true)}
        >
          <div className="classroom-grid-new-icon">+</div>
          <span className="classroom-grid-new-label">학급 만들기</span>
        </button>

        {classrooms.map((c) => (
          <div
            key={c.id}
            className={`classroom-grid-card${menuOpen === c.id ? " classroom-grid-card--menu-open" : ""}`}
          >
            <Link href={`/classroom/${c.id}`} className="classroom-grid-card-link">
              <div className="classroom-grid-name">{c.name}</div>
              <div className="classroom-grid-code">{c.code}</div>
              <div className="classroom-grid-stats">
                <span className="classroom-stat">
                  <span className="classroom-stat-num">{c._count.students}</span>
                  <span className="classroom-stat-label">명</span>
                </span>
                <span className="classroom-stat-sep" />
                <span className="classroom-stat">
                  <span className="classroom-stat-num">{c._count.boards}</span>
                  <span className="classroom-stat-label">보드</span>
                </span>
              </div>
            </Link>
            <button
              type="button"
              className="classroom-grid-kebab"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(menuOpen === c.id ? null : c.id);
              }}
              title="학급 관리"
              aria-label="학급 관리 메뉴 열기"
            >
              ···
            </button>
            {menuOpen === c.id && (
              <div className="classroom-grid-kebab-menu" role="menu">
                <button
                  type="button"
                  className="classroom-grid-kebab-item classroom-grid-kebab-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setDeleteTarget(c);
                    setMenuOpen(null);
                  }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Close menu on backdrop click */}
      {menuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1 }}
          onClick={() => setMenuOpen(null)}
        />
      )}

      {classrooms.length === 0 && (
        <div className="classroom-empty">
          <p className="classroom-empty-text">아직 학급이 없습니다</p>
          <button
            type="button"
            className="classroom-empty-btn"
            onClick={() => setShowCreate(true)}
          >
            + 학급 만들기
          </button>
        </div>
      )}

      {showCreate && (
        <CreateClassroomModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            onRefresh();
          }}
        />
      )}

      {deleteTarget && (
        <ClassroomDeleteModal
          open={deleteTarget !== null}
          classroomName={deleteTarget.name}
          pendingCount={0}
          activeCount={0}
          warningText="학급을 삭제하면 모든 학생, 보드, 학부모 연결이 함께 삭제되며 되돌릴 수 없습니다."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
