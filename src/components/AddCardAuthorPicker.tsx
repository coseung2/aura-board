"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_AUTHORS_PER_CARD, MAX_DISPLAY_NAME_LEN } from "@/lib/card-authors-constants";
import { fetchClassroomStudents, onRosterChanged } from "@/lib/client-lookup-cache";
import type { AuthorDraftRow, StudentOption } from "./add-card-modal-model";
export function AddCardAuthorPicker({
  classroomId,
  rows,
  onChange,
}: {
  classroomId: string | null;
  rows: AuthorDraftRow[];
  onChange: (rows: AuthorDraftRow[]) => void;
}) {
  const [students, setStudents] = useState<StudentOption[] | null>(
    classroomId ? null : [],
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!classroomId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setStudents(null);
    setFetchError(null);
    const load = async (force = false) => {
      try {
        const nextStudents = await fetchClassroomStudents<StudentOption>(
          classroomId,
          { force },
        );
        if (!cancelled) setStudents(nextStudents);
      } catch (e) {
        if (!cancelled) {
          setFetchError(e instanceof Error ? e.message : "load_failed");
          setStudents([]);
        }
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
    for (const row of rows) if (row.studentId) set.add(row.studentId);
    return set;
  }, [rows]);
  const capped = rows.length >= MAX_AUTHORS_PER_CARD;

  function toggleStudent(student: StudentOption) {
    if (selectedStudentIds.has(student.id)) {
      onChange(rows.filter((row) => row.studentId !== student.id));
      return;
    }
    if (capped) return;
    onChange([
      ...rows,
      {
        key: createAuthorDraftKey(),
        studentId: student.id,
        displayName: student.name,
      },
    ]);
  }

  function addFreeFormRow() {
    if (capped) return;
    onChange([
      ...rows,
      { key: createAuthorDraftKey(), studentId: null, displayName: "" },
    ]);
  }

  function updateRow(key: string, displayName: string) {
    onChange(
      rows.map((row) => (row.key === key ? { ...row, displayName } : row)),
    );
  }

  function removeRow(key: string) {
    onChange(rows.filter((row) => row.key !== key));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div
      className="modal-attach-section add-card-author-picker"
      data-has-roster={classroomId ? "true" : "false"}
    >
      {classroomId && (
        <section className="card-author-roster">
          <h3 className="card-author-section-title">학급 학생</h3>
          {!students && !fetchError && (
            <p className="card-author-loading">불러오는 중...</p>
          )}
          {fetchError && (
            <p className="card-author-error">불러오기 실패: {fetchError}</p>
          )}
          {students && students.length === 0 && !fetchError && (
            <p className="card-author-empty">학급에 학생이 없어요.</p>
          )}
          {students && students.length > 0 && (
            <ul
              role="group"
              aria-label="학급 학생 목록"
              className="card-author-student-list"
            >
              {students.map((student) => {
                const selected = selectedStudentIds.has(student.id);
                return (
                  <li key={student.id}>
                    <label
                      className={`card-author-student-row ${selected ? "is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStudent(student)}
                        disabled={!selected && capped}
                      />
                      <span className="card-author-num">
                        {student.number != null ? `${student.number}` : "-"}
                      </span>
                      <span className="card-author-name-cell">
                        {student.name}
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
            {rows.map((row, index) => (
              <li key={row.key} className="card-author-selected-row">
                <span
                  className="card-author-primary-badge"
                  aria-label={index === 0 ? "대표 작성자" : undefined}
                >
                  {index === 0 ? "📌" : `${index + 1}`}
                </span>
                <input
                  type="text"
                  className="card-author-name-input"
                  value={row.displayName}
                  maxLength={MAX_DISPLAY_NAME_LEN}
                  onChange={(e) => updateRow(row.key, e.target.value)}
                  placeholder={row.studentId ? "" : "이름 입력"}
                />
                <div className="card-author-row-actions">
                  <button
                    type="button"
                    aria-label="위로 이동"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="아래로 이동"
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="삭제"
                    className="card-author-row-remove"
                    onClick={() => removeRow(row.key)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          className="card-author-add-freeform"
          onClick={addFreeFormRow}
          disabled={capped}
        >
          + 이름만 추가
        </button>
      </section>
    </div>
  );
}

function createAuthorDraftKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `row-${crypto.randomUUID()}`;
  }
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
