"use client";

import { useEffect, useState } from "react";
import {
  type SubjectOrder,
  subjectOrderLabel,
} from "@/lib/subject-order";

type Props = {
  open: boolean;
  /** 학급 학생 수 (모달 본문 안내용) */
  studentCount: number | null;
  /** 보드에 저장된 기본 정렬 방향 (모달 초기 선택) */
  defaultOrder: SubjectOrder;
  busy: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: (order: SubjectOrder) => void;
};

/**
 * 학생이름으로 섹션 추가 모달 (2026-07-08)
 * - 출석번호 방향(1번부터 / 끝번호부터)을 라디오로 명시 선택
 * - 마지막 선택을 Board.subjectOrder에 보존하여 다음 시드의 기본값으로 사용
 */
export function SeedStudentsDialog({
  open,
  studentCount,
  defaultOrder,
  busy,
  errorMessage,
  onClose,
  onConfirm,
}: Props) {
  const [order, setOrder] = useState<SubjectOrder>(defaultOrder);

  // 모달이 다시 열릴 때마다 보드의 최신 기본값으로 초기화.
  useEffect(() => {
    if (open) setOrder(defaultOrder);
  }, [open, defaultOrder]);

  // ESC로 닫기 + body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const ascLabel = subjectOrderLabel("asc");
  const descLabel = subjectOrderLabel("desc");
  const studentLine =
    studentCount == null
      ? "학급에 등록된 학생을 출석번호 순으로 섹션으로 추가합니다."
      : studentCount === 0
        ? "이 학급에는 등록된 학생이 없습니다."
        : `학급 ${studentCount}명의 학생을 출석번호 순으로 섹션으로 추가합니다.`;

  return (
    <div className="seed-students-modal-wrap" role="presentation">
      <button
        type="button"
        className="modal-backdrop seed-students-modal-backdrop"
        aria-label="닫기"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className="add-card-modal seed-students-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seed-students-modal-title"
      >
        <div className="modal-header">
          <h2 id="seed-students-modal-title" className="modal-title">
            학생 이름으로 섹션 추가
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="닫기"
            onClick={() => {
              if (!busy) onClose();
            }}
          >
            ×
          </button>
        </div>

        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            onConfirm(order);
          }}
        >
          <p className="seed-students-modal-desc">{studentLine}</p>

          <fieldset
            className="seed-students-modal-fieldset"
            disabled={busy}
            aria-label="정렬 방향 선택"
          >
            <legend className="seed-students-modal-legend">
              출석번호 방향
            </legend>
            <label
              className={`seed-students-option ${
                order === "asc" ? "is-selected" : ""
              }`}
            >
              <input
                type="radio"
                name="subject-order"
                value="asc"
                checked={order === "asc"}
                onChange={() => setOrder("asc")}
              />
              <span className="seed-students-option-title">
                {ascLabel.short} 앞으로
              </span>
              <span className="seed-students-option-desc">
                {ascLabel.long}
              </span>
            </label>
            <label
              className={`seed-students-option ${
                order === "desc" ? "is-selected" : ""
              }`}
            >
              <input
                type="radio"
                name="subject-order"
                value="desc"
                checked={order === "desc"}
                onChange={() => setOrder("desc")}
              />
              <span className="seed-students-option-title">
                {descLabel.short}부터 앞으로
              </span>
              <span className="seed-students-option-desc">
                {descLabel.long}
              </span>
            </label>
          </fieldset>

          <p className="seed-students-modal-hint">
            기존에 만든 섹션은 그대로 남고, 새 학생 섹션은 그 뒤에 추가돼요.
            같은 학생이 이미 있으면 이름이 같은 새 섹션이 추가로 만들어지니
            필요하면 직접 정리해 주세요.
          </p>

          {errorMessage && (
            <p className="board-settings-error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="modal-btn-cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy || studentCount === 0}
              className="modal-btn-submit"
            >
              {busy ? "추가 중..." : "섹션 만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
