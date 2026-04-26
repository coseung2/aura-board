"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type ChildRow = {
  studentId: string;
  studentName: string;
  studentNumber: number | null;
  classroomName: string;
};

type Props = {
  children: ChildRow[];
  selectedId: string;
  onSelect: (studentId: string) => void;
};

// parent-redesign (2026-04-26): 다자녀 셀렉터 chip + dropdown.
// 자녀 1명: 정적 chip (클릭 무반응). ≥2명: ▼ 표시 + dropdown menu.
export function ParentChildSelector({
  children: childRows,
  selectedId,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // outside click close
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected =
    childRows.find((c) => c.studentId === selectedId) ?? childRows[0];
  if (!selected) return null;

  const isMulti = childRows.length > 1;

  if (!isMulti) {
    return (
      <div className="parent-child-chip is-static" aria-label="자녀">
        <span className="parent-child-chip-name">{selected.studentName}</span>
        <span className="parent-child-chip-meta">{selected.classroomName}</span>
      </div>
    );
  }

  return (
    <div className="parent-child-chip-wrap" ref={ref}>
      <button
        type="button"
        className="parent-child-chip is-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="자녀 선택"
      >
        <span className="parent-child-chip-name">{selected.studentName}</span>
        <span className="parent-child-chip-meta">{selected.classroomName}</span>
        <span className="parent-child-chip-caret" aria-hidden>
          ▼
        </span>
      </button>
      {open && (
        <ul className="parent-child-dropdown" role="listbox">
          {childRows.map((c) => {
            const isSelected = c.studentId === selectedId;
            return (
              <li key={c.studentId} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`parent-child-dropdown-item ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => {
                    setOpen(false);
                    onSelect(c.studentId);
                  }}
                >
                  {isSelected && (
                    <span className="parent-child-dropdown-check" aria-hidden>
                      🟢
                    </span>
                  )}
                  <span className="parent-child-dropdown-name">
                    {c.studentName}
                  </span>
                  <span className="parent-child-dropdown-meta">
                    {c.classroomName}
                  </span>
                </button>
              </li>
            );
          })}
          <li className="parent-child-dropdown-divider" role="presentation" />
          <li role="presentation">
            <Link
              href="/parent/onboard/match/code"
              className="parent-child-dropdown-item parent-child-dropdown-add"
            >
              <span aria-hidden>＋</span>
              <span>자녀 추가</span>
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
