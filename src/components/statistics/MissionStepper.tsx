"use client";

import { MissionDTO } from "./StatisticsBoardClient";
import { MissionStepItem } from "./MissionStepItem";

export function MissionStepper({
  missions,
  currentStep,
  onSelect,
}: {
  missions: MissionDTO[];
  currentStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav className="mission-stepper" role="tablist" aria-label="미션 목록">
      {missions.map((mission) => (
        <MissionStepItem
          key={mission.stepNumber}
          mission={mission}
          isActive={mission.stepNumber === currentStep}
          isLocked={mission.status === "not_started" && mission.stepNumber > 1}
          onClick={() => onSelect(mission.stepNumber)}
        />
      ))}
    </nav>
  );
}
