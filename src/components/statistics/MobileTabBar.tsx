"use client";

import type { MissionDTO } from "./StatisticsBoardClient";
import { MISSION_TITLES } from "./missionTitles";

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
            {isDone ? "✓" : mission.stepNumber}. {MISSION_TITLES[mission.stepNumber]}
          </button>
        );
      })}
    </nav>
  );
}
