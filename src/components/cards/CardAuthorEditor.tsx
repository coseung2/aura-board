"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  MAX_AUTHORS_PER_CARD,
  MAX_DISPLAY_NAME_LEN,
} from "@/lib/card-authors-constants";
import {
  fetchClassroomStudents,
  onRosterChanged,
} from "@/lib/client-lookup-cache";

type Student = { id: string; name: string; number: number | null };

type AuthorRow = {
  key: string;
  studentId: string | null;
  displayName: string;
};

export type SavedAuthor = {
  id: string;
  studentId: string | null;
  displayName: string;
  order: number;
};

type Props = {
  cardId: string;
  classroomId: string | null;
  initialAuthors: SavedAuthor[];
  isStudentViewer?: boolean;
  studentOwnerId?: string | null;
  onSaved: (authors: SavedAuthor[]) => void;
  onClose: () => void;
};

/**
 * Teacher-only modal for replace-all authors of a card.
 *
 * Two input surfaces:
 *   - Roster multi-select (only when classroomId is provided) — primary
 *     pattern; each tick appends a row with studentId + name snapshot.
 *   - Free-form row add — for guest co-authors or boards without a
 *     classroom. studentId stays null.
 *
 * Order is controlled by up/down arrows in the right panel; the
 * first row is the primary (studentAuthorId mirror).
 */
export function CardAuthorEditor({
  cardId,
  classroomId,
  initialAuthors,
  isStudentViewer = false,
  studentOwnerId = null,
  onSaved,
  onClose,
}: Props) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuthorRow[]>(() =>
    initialAuthors
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((a) => ({
        key: a.id,
        studentId: a.studentId,
        displayName: a.displayName,
      })),
  );
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!classroomId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    const load = async (force = false) => {
      try {
        const nextStudents = await fetchClassroomStudents<Student>(
          classroomId,
          {
            force,
          },
        );
        if (!cancelled) setStudents(nextStudents);
      } catch (e) {
        if (!cancelled)
          setFetchError(e instanceof Error ? e.message : "load_failed");
      }
    };
    void load();
    const unsubscribe = onRosterChanged(classroomId, () => void load(true));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [classroomId]);

  const selectedStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.studentId) set.add(r.studentId);
    return set;
  }, [rows]);

  const capped = rows.length >= MAX_AUTHORS_PER_CARD;
  const studentRestricted = isStudentViewer && Boolean(studentOwnerId);
  const studentSelectionValid =
    !studentRestricted ||
    (rows[0]?.studentId === studentOwnerId &&
      rows.every((row) => Boolean(row.studentId)));

  function toggleStudent(s: Student) {
    if (selectedStudentIds.has(s.id)) {
      if (studentRestricted && s.id === studentOwnerId) return;
      setRows((prev) => prev.filter((r) => r.studentId !== s.id));
      return;
    }
    if (capped) return;
    setRows((prev) => [
      ...prev,
      {
        key: `row-${crypto.randomUUID()}`,
        studentId: s.id,
        displayName: s.name,
      },
    ]);
  }

  function addFreeFormRow() {
    if (capped || studentRestricted) return;
    setRows((prev) => [
      ...prev,
      { key: `row-${crypto.randomUUID()}`, studentId: null, displayName: "" },
    ]);
  }

  function updateRow(key: string, patch: Partial<AuthorRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    if (
      studentRestricted &&
      (next[index]?.studentId === studentOwnerId ||
        next[target]?.studentId === studentOwnerId)
    ) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  async function handleSave() {
    setBusy(true);
    setSaveError(null);
    try {
      const cleaned = rows
        .map((r) => ({
          studentId: r.studentId,
          displayName: r.displayName.trim(),
        }))
        .filter((r) => r.displayName.length > 0);
      const res = await fetch(`/api/cards/${cardId}/authors`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(isStudentViewer ? { "x-aura-student-viewer": "1" } : {}),
        },
        body: JSON.stringify({ authors: cleaned }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.detail ?? b?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { authors: SavedAuthor[] };
      onSaved(data.authors ?? []);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="modal-backdrop card-author-editor-backdrop"
        onClick={onClose}
      />
      <div
        className="add-card-modal card-author-editor"
        role="dialog"
        aria-labelledby="card-author-editor-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="card-author-editor-title">
            작성자 지정
          </h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body card-author-editor-body">
          {classroomId && (
            <section className="card-author-roster">
              <h3 className="card-author-section-title">학급 학생</h3>
              {!students && !fetchError && (
                <p className="card-author-loading">불러오는 중...</p>
              )}
              {fetchError && (
                <p className="card-author-error">불러오기 실패: {fetchError}</p>
              )}
              {students && students.length === 0 && (
                <p className="card-author-empty">학급에 학생이 없어요.</p>
              )}
              {students && students.length > 0 && (
                <ul
                  role="group"
                  aria-label="학급 학생 목록"
                  className="card-author-student-list"
                >
                  {students.map((s) => {
                    const selected = selectedStudentIds.has(s.id);
                    return (
                      <li key={s.id}>
                        <label
                          className={`card-author-student-row ${selected ? "is-selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleStudent(s)}
                            disabled={
                              (selected &&
                                studentRestricted &&
                                s.id === studentOwnerId) ||
                              (!selected && capped)
                            }
                          />
                          <span className="card-author-num">
                            {s.number != null ? `${s.number}` : "-"}
                          </span>
                          <span className="card-author-name-cell">
                            {s.name}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <section className="card-author-selected">
            <h3 className="card-author-section-title">
              선택된 작성자
              <span className="card-author-count">
                {rows.length} / {MAX_AUTHORS_PER_CARD}
              </span>
            </h3>
            {rows.length === 0 && (
              <p className="card-author-empty">
                {classroomId
                  ? "왼쪽에서 학생을 선택하거나 아래 버튼으로 추가하세요."
                  : "아래 버튼으로 작성자를 추가하세요."}
              </p>
            )}
            {rows.length > 0 && (
              <ol className="card-author-selected-list">
                {rows.map((r, i) => (
                  <li key={r.key} className="card-author-selected-row">
                    <span
                      className="card-author-primary-badge"
                      aria-label={i === 0 ? "대표 작성자" : undefined}
                    >
                      {i === 0 ? "📌" : `${i + 1}`}
                    </span>
                    <input
                      type="text"
                      className="card-author-name-input"
                      value={r.displayName}
                      readOnly={studentRestricted}
                      maxLength={MAX_DISPLAY_NAME_LEN}
                      onChange={(e) =>
                        updateRow(r.key, { displayName: e.target.value })
                      }
                      placeholder={r.studentId ? "" : "이름 입력"}
                    />
                    <div className="card-author-row-actions">
                      <button
                        type="button"
                        aria-label="위로 이동"
                        onClick={() => move(i, -1)}
                        disabled={
                          i === 0 ||
                          (studentRestricted &&
                            (r.studentId === studentOwnerId ||
                              rows[i - 1]?.studentId === studentOwnerId))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="아래로 이동"
                        onClick={() => move(i, 1)}
                        disabled={
                          i === rows.length - 1 ||
                          (studentRestricted &&
                            (r.studentId === studentOwnerId ||
                              rows[i + 1]?.studentId === studentOwnerId))
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label="삭제"
                        className="card-author-row-remove"
                        onClick={() => removeRow(r.key)}
                        disabled={
                          studentRestricted && r.studentId === studentOwnerId
                        }
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {studentRestricted ? (
              <p className="card-author-empty">
                본인을 대표 작성자로 두고 학급 학생만 공동 작성자로 지정할 수
                있어요.
              </p>
            ) : (
              <button
                type="button"
                className="card-author-add-freeform"
                onClick={addFreeFormRow}
                disabled={capped}
              >
                + 이름만 추가
              </button>
            )}
            {!studentSelectionValid && (
              <p className="card-author-error">
                본인을 첫 번째 작성자로 선택하고 직접 입력 작성자는 제거해
                주세요.
              </p>
            )}
          </section>

          {saveError && (
            <div className="card-author-error card-author-save-error">
              저장 실패: {saveError}
            </div>
          )}

          <div className="modal-actions">
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
              className="modal-btn-submit"
              onClick={handleSave}
              disabled={busy || !studentSelectionValid}
            >
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
