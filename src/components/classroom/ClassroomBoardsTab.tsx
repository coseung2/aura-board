"use client";

// /classroom/[id]/boards 전용 — 학급에 연결된 보드 목록 + 연결/해제.
// 기존 ClassroomDetail 안에 묻혀있던 "공유된 보드" 섹션을 독립 컴포넌트로 추출.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { layoutEmoji, layoutLabel } from "@/lib/layout-meta";

type Board = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  updatedAt?: string;
};

type Props = {
  classroomId: string;
  linkedBoards: Board[];
  allBoards: Board[]; // 교사가 소유한 전체 보드 (picker용)
};

export function ClassroomBoardsTab({ classroomId, linkedBoards, allBoards }: Props) {
  const router = useRouter();
  const [linkedIds, setLinkedIds] = useState<Set<string>>(
    new Set(linkedBoards.map((b) => b.id)),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
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
        alert("보드 연결에 실패했습니다.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function unlink(boardId: string) {
    if (!confirm("이 보드를 학급에서 연결 해제할까요? 보드 자체는 삭제되지 않습니다.")) return;
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
        alert("연결 해제에 실패했습니다.");
      }
    } finally {
      setBusy(null);
    }
  }

  const linked = allBoards.filter((b) => linkedIds.has(b.id));
  const available = allBoards.filter((b) => !linkedIds.has(b.id));

  return (
    <div className="classroom-boards-section">
      <div className="classroom-boards-header">
        <h2 className="classroom-boards-heading">학급 보드</h2>
        <button
          type="button"
          className="classroom-action-btn"
          onClick={() => setShowPicker((v) => !v)}
        >
          {showPicker ? "닫기" : "+ 보드 연결"}
        </button>
      </div>

      {showPicker && (
        <div className="classroom-board-picker">
          {available.length === 0 ? (
            <p className="classroom-board-picker-empty">
              연결할 보드가 없습니다. 대시보드에서 보드를 먼저 만들어 주세요.
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
          연결된 보드가 없습니다. <strong>+ 보드 연결</strong>에서 이미 만든 보드를 학급에
          붙이거나, 대시보드에서 새 보드를 만든 뒤 여기로 돌아와 연결하세요.
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
    </div>
  );
}
