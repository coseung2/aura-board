"use client";

// /classroom/[id]/boards 전용 — 학급에 연결된 보드 목록 + 연결/해제.
// 기존 ClassroomDetail 안에 묻혀있던 "공유된 보드" 섹션을 독립 컴포넌트로 추출.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { layoutEmoji, layoutLabel } from "@/lib/layout-meta";
import { CreateBoardModal } from "@/components/CreateBoardModal";

type Board = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  updatedAt?: string;
};

type Props = {
  classroomId: string;
  classroomName: string;
  studentCount: number;
  linkedBoards: Board[];
  allBoards: Board[]; // 교사가 소유한 전체 보드 (picker용)
  autoOpenCreate?: boolean;
  isAdmin?: boolean;
  userTier?: "free" | "pro";
};

export function ClassroomBoardsTab({
  classroomId,
  classroomName,
  studentCount,
  linkedBoards,
  allBoards,
  autoOpenCreate = false,
  isAdmin = false,
  userTier = "pro",
}: Props) {
  const router = useRouter();
  const [linkedIds, setLinkedIds] = useState<Set<string>>(
    new Set(linkedBoards.map((b) => b.id)),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(autoOpenCreate);
  const [lastVisited, setLastVisited] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lastVisitedBoards");
      if (raw) setLastVisited(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  async function link(boardId: string) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setError(null);
    setBusy(boardId);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId }),
      });
      if (res.ok) {
        setLinkedIds((prev) => new Set(prev).add(boardId));
      } else {
        throw new Error("board_link_failed");
      }
    } catch {
      setError("보드 연결 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요.");
    } finally {
      mutationLock.current = false;
      setBusy(null);
    }
  }

  async function unlink(boardId: string) {
    if (mutationLock.current) return;
    if (!confirm("이 보드를 학급에서 연결 해제할까요? 보드 자체는 삭제되지 않습니다.")) return;
    mutationLock.current = true;
    setError(null);
    setBusy(boardId);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId: null }),
      });
      if (res.ok) {
        setLinkedIds((prev) => {
          const next = new Set(prev);
          next.delete(boardId);
          return next;
        });
      } else {
        throw new Error("board_unlink_failed");
      }
    } catch {
      setError("연결 해제 결과를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요.");
    } finally {
      mutationLock.current = false;
      setBusy(null);
    }
  }

  const linked = allBoards.filter((b) => linkedIds.has(b.id));
  const available = allBoards.filter((b) => !linkedIds.has(b.id));

  function closeCreate() {
    setShowCreate(false);
    if (autoOpenCreate) {
      router.replace(`/classroom/${classroomId}/boards`, { scroll: false });
    }
  }

  return (
    <div className="classroom-boards-section">
      <div className="classroom-boards-header">
        <h2 className="classroom-boards-heading">학급 보드</h2>
        <div className="classroom-action-bar" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          <button
            type="button"
            className="classroom-action-btn"
            onClick={() => setShowCreate(true)}
          >
            + 새 보드 만들기
          </button>
          <button
            type="button"
            className="classroom-action-btn"
            onClick={() => setShowPicker((v) => !v)}
          >
            {showPicker ? "닫기" : "기존 보드 연결"}
          </button>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {showPicker && (
        <div className="classroom-board-picker">
          {available.length === 0 ? (
            <p className="classroom-board-picker-empty">
              연결할 기존 보드가 없습니다. 새 보드는 이 화면에서 바로 만들 수 있습니다.
            </p>
          ) : (
            available.map((b) => (
              <button
                key={b.id}
                type="button"
                className="classroom-board-picker-item"
                onClick={() => link(b.id)}
                disabled={busy === b.id}
              >
                <span className="classroom-board-title">
                  {layoutEmoji(b.layout)} {b.title || "제목 없음"}
                </span>
                <span className="classroom-board-layout">
                  {layoutLabel(b.layout)}
                </span>
                <span className="classroom-board-link-action">+ 연결</span>
              </button>
            ))
          )}
        </div>
      )}

      {linked.length === 0 ? (
        <p className="classroom-boards-empty">
          연결된 보드가 없습니다. <strong>+ 새 보드 만들기</strong>로 이 학급의 첫 보드를
          만들거나, 기존 보드를 연결하세요.
        </p>
      ) : (
        <div className="classroom-boards-grid">
          {linked.map((b) => {
            const last = lastVisited[b.id];
            const updated = b.updatedAt;
            const isNew =
              !!updated &&
              (!last || new Date(updated).getTime() > new Date(last).getTime());
            return (
              <div key={b.id} className="classroom-board-card">
                <button
                  type="button"
                  className="classroom-board-card-body"
                  onClick={() => router.push(`/board/${b.slug}`)}
                >
                  <span className="classroom-board-title">
                    {layoutEmoji(b.layout)} {b.title || "제목 없음"}
                  </span>
                  <span className="classroom-board-layout">
                    {layoutLabel(b.layout)}
                  </span>
                  {isNew && (
                    <span className="classroom-board-new" title="마지막 방문 이후 새 활동">
                      <span className="classroom-board-new-dot" aria-hidden />
                      <span>새 활동</span>
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="classroom-board-unlink"
                  onClick={() => unlink(b.id)}
                  title="연결 해제"
                  disabled={busy === b.id}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <CreateBoardModal
          classrooms={[{ id: classroomId, name: classroomName, studentCount }]}
          isAdmin={isAdmin}
          userTier={userTier}
          fixedClassroomId={classroomId}
          onClose={closeCreate}
        />
      ) : null}
    </div>
  );
}
