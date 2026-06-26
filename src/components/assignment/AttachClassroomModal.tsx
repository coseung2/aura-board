"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNMENT_MAX_SLOTS } from "@/lib/assignment-schemas";

export type ClassroomOption = {
  id: string;
  name: string;
  studentCount: number;
};

type Mode = "attach" | "sync";

type Props = {
  boardId: string;
  mode: Mode;
  classrooms?: ClassroomOption[];
  boundClassroomName?: string | null;
  newStudentCount?: number;
  onClose: () => void;
};

export function AttachClassroomModal({
  boardId,
  mode,
  classrooms = [],
  boundClassroomName,
  newStudentCount,
  onClose,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  async function submit(classroomId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/roster-sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(classroomId ? { classroomId } : {}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b?.error ?? "sync_failed");
        setBusy(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("network_error");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="add-card-modal create-board-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === "attach" ? "학급 배당하기" : "새 학생 동기화"}
          </h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {mode === "attach" && (
            <>
              <p className="create-board-hint">
                학급을 선택하면 학생 수만큼 과제 slot이 자동 생성됩니다.
              </p>
              {classrooms.length === 0 ? (
                <p className="create-board-hint">먼저 학급을 만들어 주세요.</p>
              ) : (
                <div className="layout-picker">
                  {classrooms.map((c) => {
                    const over = c.studentCount > ASSIGNMENT_MAX_SLOTS;
                    const empty = c.studentCount === 0;
                    const disabled = busy || over;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="layout-option"
                        disabled={disabled}
                        onClick={() => {
                          setPicked(c.id);
                          submit(c.id);
                        }}
                      >
                        <span className="layout-option-emoji">🏫</span>
                        <span className="layout-option-label">{c.name}</span>
                        <span className="layout-option-desc">
                          {over
                            ? `학생 ${c.studentCount}명 - 최대 ${ASSIGNMENT_MAX_SLOTS}명까지만 가능`
                            : empty
                              ? "학생 0명 - 먼저 학생을 추가하세요"
                              : `학생 ${c.studentCount}명 → slot ${c.studentCount}개 생성`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {mode === "sync" && (
            <>
              <p className="create-board-hint">
                {boundClassroomName ? (
                  <strong>{boundClassroomName}</strong>
                ) : (
                  "연결된 학급"
                )}{" "}
                에서 새 학생 <strong>{newStudentCount ?? 0}명</strong>을
                slot으로 추가합니다.
              </p>
              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={onClose}
                  disabled={busy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="modal-btn-primary"
                  onClick={() => submit()}
                  disabled={busy || !newStudentCount}
                >
                  {busy ? "동기화 중..." : "동기화"}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="assign-inline-error" style={{ marginTop: 12 }}>
              {error === "classroom_too_large"
                ? `학생 수가 ${ASSIGNMENT_MAX_SLOTS}명을 초과합니다.`
                : error === "student_missing_number"
                  ? "출석번호가 비어 있는 학생이 있습니다."
                  : error === "would_exceed_max"
                    ? `총 slot 수가 ${ASSIGNMENT_MAX_SLOTS}명을 초과합니다.`
                    : `동기화 실패: ${error}`}
            </div>
          )}
          {picked && busy && !error && (
            <p className="create-board-hint" style={{ marginTop: 10 }}>
              학급 배당 중...
            </p>
          )}
        </div>
      </div>
    </>
  );
}
