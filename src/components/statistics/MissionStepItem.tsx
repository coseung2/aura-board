"use client";

import { MissionDTO } from "./StatisticsBoardClient";

export function MissionStepItem({
  mission,
  isActive,
  isLocked,
  onClick,
}: {
  mission: MissionDTO;
  isActive: boolean;
  isLocked: boolean;
  onClick: () => void;
}) {
  const isDone = mission.status === "approved" || mission.status === "completed";

  return (
    <button
      className={`mission-step-item ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`}
      role="tab"
      aria-selected={isActive}
      aria-label={`미션 ${mission.stepNumber}, ${missionTitles[mission.stepNumber]}, 상태: ${statusLabel(mission.status)}`}
      onClick={() => {
        if (isLocked) return;
        onClick();
      }}
      disabled={isLocked}
    >
      <span className="mission-step-num">
        {isDone ? "✓" : mission.stepNumber}
      </span>
      <span className="mission-step-text">
        <span className="mission-step-title">
          {mission.stepNumber}. {missionTitles[mission.stepNumber]}
        </span>
        <span className="mission-step-status">{statusLabel(mission.status)}</span>
      </span>
    </button>
  );
}

const missionTitles: Record<number, string> = {
  1: "주제 카드",
  2: "질문 사다리",
  3: "설문 문항",
  4: "조사 계획",
  5: "자료 수집",
  6: "그래프 계획",
  7: "결과 해석",
  8: "결론·제안",
  9: "포스터 의뢰",
  10: "포스터 검토",
  11: "발표 준비",
};

function statusLabel(status: MissionDTO["status"]): string {
  switch (status) {
    case "not_started":
      return "시작 전";
    case "in_progress":
      return "수정 중";
    case "pending_approval":
      return "승인 요청";
    case "approved":
      return "승인 완료";
    case "teacher_working":
      return "교사 제작 중";
    case "completed":
      return "완료";
  }
}
