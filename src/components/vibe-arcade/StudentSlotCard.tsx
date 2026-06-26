"use client";

// Vibe arcade student slot card (2026-04-21, Phase 1).
// 슬롯 하나 = 학급의 학생 한 명. status에 따라 pill/CTA가 달라진다.
// - empty        → "아직 시작 안 함" + [만들기] (본인만)
// - in-progress  → "작업 중" + [이어하기] (본인만)
// - needs-review → "선생님 확인 중" pill (모두 공통)
// - submitted    → "완성" pill + 썸네일 (공개)
// - returned     → "수정 요청" pill + 교사 노트 (본인만 보임)

import type { VibeSlotDTO, VibeSlotStatus } from "@/app/api/vibe/slots/route";

type Props = {
  slot: VibeSlotDTO;
  isSelf: boolean;
  isTeacher: boolean;
  onOpen?: (slot: VibeSlotDTO) => void;
};

const STATUS_LABEL: Record<VibeSlotStatus, string> = {
  empty: "아직 없음",
  "in-progress": "작업 중",
  "needs-review": "선생님 확인 중",
  submitted: "완성",
  returned: "수정 요청",
};

const STATUS_PILL_CLASS: Record<VibeSlotStatus, string> = {
  empty: "vs-pill vs-pill-empty",
  "in-progress": "vs-pill vs-pill-draft",
  "needs-review": "vs-pill vs-pill-review",
  submitted: "vs-pill vs-pill-submitted",
  returned: "vs-pill vs-pill-returned",
};

export function StudentSlotCard({ slot, isSelf, isTeacher, onOpen }: Props) {
  const status = slot.status;
  const canInteract = isSelf || isTeacher;
  const isEmpty = status === "empty";

  const cta = (() => {
    if (!isSelf && !isTeacher) return null;
    if (isSelf && isEmpty) return "+ 만들기";
    if (isSelf && status === "in-progress") return "이어하기 →";
    if (isSelf && status === "returned") return "다시 쓰기 →";
    if (isTeacher && status === "needs-review") return "검토하기 →";
    if (isTeacher && status === "submitted") return "보기 →";
    return null;
  })();

  return (
    <button
      type="button"
      className={`vs-slot${isSelf ? " is-self" : ""}${isEmpty ? " is-empty" : ""}`}
      onClick={canInteract && onOpen ? () => onOpen(slot) : undefined}
      disabled={!canInteract || !cta}
      aria-label={`${slot.studentName} - ${STATUS_LABEL[status]}`}
    >
      <header className="vs-slot-header">
        <span className="vs-slot-name">
          {slot.studentNumber != null && (
            <span className="vs-slot-num">{slot.studentNumber}</span>
          )}
          {slot.studentName}
          {isSelf && <span className="vs-self-badge">나</span>}
        </span>
        <span className={STATUS_PILL_CLASS[status]}>
          {STATUS_LABEL[status]}
        </span>
      </header>

      {slot.project ? (
        <div className="vs-slot-body">
          {slot.project.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="vs-slot-thumb"
              src={slot.project.thumbnailUrl}
              alt={`${slot.project.title} 썸네일`}
              width={160}
              height={120}
              loading="lazy"
            />
          ) : (
            <div className="vs-slot-thumb vs-slot-thumb-fallback" aria-hidden />
          )}
          <h3 className="vs-slot-title">{slot.project.title}</h3>
        </div>
      ) : (
        <div className="vs-slot-body vs-slot-body-empty">
          <span className="vs-slot-empty-icon" aria-hidden>
            ✨
          </span>
          <p className="vs-slot-empty-hint">
            {isSelf ? "아직 시작하지 않았어요." : "아직 없어요."}
          </p>
        </div>
      )}

      {status === "returned" && slot.project?.moderationNote && isSelf && (
        <p className="vs-slot-note">“{slot.project.moderationNote}”</p>
      )}

      {cta && <div className="vs-slot-cta">{cta}</div>}
    </button>
  );
}
