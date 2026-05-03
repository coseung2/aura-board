"use client";

import type { MissionDTO } from "./StatisticsBoardClient";
import { MISSION_TITLES } from "./missionTitles";

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
      aria-label={`미션 ${mission.stepNumber}, ${MISSION_TITLES[mission.stepNumber]}, 상태: ${statusLabel(mission.status)}`}
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
          {mission.stepNumber}. {MISSION_TITLES[mission.stepNumber]}
        </span>
        <span className="mission-step-status">{statusLabel(mission.status)}</span>
      </span>
    </button>
  );
}

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
