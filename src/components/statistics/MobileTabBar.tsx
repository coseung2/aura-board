"use client";

import { MissionDTO } from "./StatisticsBoardClient";

export function MobileTabBar({
  missions,
  currentStep,
  onSelect,
}: {
  missions: MissionDTO[];
  currentStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav
      className="mobile-tab-bar"
      role="tablist"
      aria-orientation="horizontal"
      aria-label="미션 탭"
    >
      {missions.map((mission) => {
        const isActive = mission.stepNumber === currentStep;
        const isDone = mission.status === "approved" || mission.status === "completed";
        const isLocked = mission.status === "not_started" && mission.stepNumber > 1;

        return (
          <button
            key={mission.stepNumber}
            role="tab"
            aria-selected={isActive}
            className={`mobile-tab-bar-item ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isLocked ? "locked" : ""}`}
            onClick={() => {
              if (isLocked) return;
              onSelect(mission.stepNumber);
            }}
            disabled={isLocked}
            style={{
              padding: "8px 14px",
              borderRadius: "999px",
              border: "none",
              background: isActive ? "var(--color-accent)" : isDone ? "#27a35f" : "var(--color-surface)",
              color: isActive || isDone ? "#fff" : "var(--color-text)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isLocked ? "not-allowed" : "pointer",
              opacity: isLocked ? 0.4 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {isDone ? "✓" : mission.stepNumber}. {missionTitles[mission.stepNumber]}
          </button>
        );
      })}
    </nav>
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
