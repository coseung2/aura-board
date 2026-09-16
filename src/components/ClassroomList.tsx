"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateClassroomModal } from "./CreateClassroomModal";
import { ClassroomDeleteModal } from "./classroom/ClassroomDeleteModal";
import { notifyClassroomListChanged } from "@/lib/client-lookup-cache";

type ClassroomItem = {
  id: string;
  name: string;
  code: string;
  _count: { students: number; boards: number };
};

type Props = {
  classrooms: ClassroomItem[];
  onRefresh: () => void;
  autoOpenCreate?: boolean;
  resumeBoardLayout?: string | null;
};

export function ClassroomList({
  classrooms,
  onRefresh,
  autoOpenCreate = false,
  resumeBoardLayout = null,
}: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(autoOpenCreate);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassroomItem | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        menuRootRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/classroom/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmName: deleteTarget.name }),
      });
      if (res.ok) {
        notifyClassroomListChanged();
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

  function closeCreate() {
    setShowCreate(false);
    if (autoOpenCreate || resumeBoardLayout) router.replace("/classroom");
  }

  return (
    <>
      {classrooms.length > 0 ? (
        <div className="classroom-grid">
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
              ref={menuOpen === c.id ? menuRootRef : null}
              className={`classroom-grid-card${menuOpen === c.id ? " classroom-grid-card--menu-open" : ""}`}
            >
              <Link
                href={`/classroom/${c.id}/dashboard`}
                className="classroom-grid-card-link"
              >
                <div className="classroom-grid-name">{c.name}</div>
                <div className="classroom-grid-code">연동 코드 · {c.code}</div>
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
                  <Link
                    href={`/classroom/${c.id}/dashboard`}
                    className="classroom-grid-kebab-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(null)}
                  >
                    수정
                  </Link>
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
      ) : (
        <div className="classroom-empty">
          <p className="classroom-empty-text">첫 학급을 만들어 학생을 등록해 보세요.</p>
          <button
            type="button"
            className="classroom-empty-btn"
            onClick={() => setShowCreate(true)}
          >
            학급 만들기
          </button>
        </div>
      )}

      {showCreate && (
        <CreateClassroomModal
          open={showCreate}
          onClose={closeCreate}
          onCreated={(classroom) => {
            setShowCreate(false);
            if (classroom) {
              if (resumeBoardLayout) {
                const query = new URLSearchParams({
                  create: "1",
                  layout: resumeBoardLayout,
                  classroomId: classroom.id,
                });
                router.push(`/dashboard?${query.toString()}`);
                return;
              }
              // 새 학급은 곧바로 안내 화면으로 들어간다 — 학생 명단 카드를
              // 강조해 첫 학생 추가로 이어진다.
              router.push(`/classroom/${classroom.id}/dashboard?firstRun=1`);
              return;
            }
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
