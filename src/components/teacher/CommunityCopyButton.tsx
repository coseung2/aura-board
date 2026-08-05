"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Classroom = { id: string; name: string };

export function CommunityCopyButton({
  boardId,
  classrooms,
  label = "내 반으로 복사",
}: {
  boardId: string;
  classrooms: Classroom[];
  label?: string;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeDialog() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    selectRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, open]);

  async function copyBoard() {
    if (!classroomId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/teacher/share/boards/${boardId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        boardUrl?: string;
      };
      if (!response.ok || !payload.boardUrl) {
        throw new Error(
          payload.error === "classroom_not_found"
            ? "선택한 학급을 확인해 주세요."
            : "보드를 복사하지 못했습니다.",
        );
      }
      router.push(payload.boardUrl);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "보드를 복사하지 못했습니다.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="community-primary-action"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={classrooms.length === 0}
        title={classrooms.length === 0 ? "복사할 학급을 먼저 만들어 주세요." : undefined}
      >
        {label}
      </button>
      {open ? (
        <div
          className="community-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) closeDialog();
          }}
        >
          <section
            className="community-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`copy-board-${boardId}`}
          >
            <header className="community-dialog-header">
              <div>
                <h2 id={`copy-board-${boardId}`}>복사할 학급 선택</h2>
                <p>보드 구조와 주제만 복사되며 게시물과 학생 결과물은 제외됩니다.</p>
              </div>
              <button
                type="button"
                className="community-dialog-close"
                aria-label="닫기"
                onClick={closeDialog}
                disabled={busy}
              >
                ×
              </button>
            </header>
            <label className="community-dialog-field">
              학급
              <select
                ref={selectRef}
                value={classroomId}
                onChange={(event) => setClassroomId(event.target.value)}
                disabled={busy}
              >
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="community-error" role="alert">{error}</p> : null}
            <footer className="community-dialog-actions">
              <button type="button" onClick={closeDialog} disabled={busy}>
                취소
              </button>
              <button type="button" onClick={() => void copyBoard()} disabled={busy}>
                {busy ? "복사 중…" : "빈 보드로 복사"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
