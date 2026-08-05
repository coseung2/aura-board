"use client";

import type { CSSProperties, ReactNode } from "react";

import { OfficialSlimeSprite } from "@/components/creatures/OfficialSlimeSprite";
import type { SlimeColor } from "@/lib/pets/types";

import styles from "./MissionProgressTrack.module.css";

export type MissionProgressPet = {
  color: SlimeColor;
  growthStage: 1 | 2 | 3;
};

export type MissionProgressMarker = {
  key: string;
  value: number;
  label: string;
  achieved?: boolean;
  content: ReactNode;
};

type Props = {
  value: number;
  max: number;
  markers: readonly MissionProgressMarker[];
  accessibilityLabel: string;
  representativePet: MissionProgressPet | null;
  minWidth?: number;
};

function percent(value: number, max: number) {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function MissionProgressTrack({
  value,
  max,
  markers,
  accessibilityLabel,
  representativePet,
  minWidth = 360,
}: Props) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(safeMax, Math.max(0, value));
  const progress = percent(safeValue, safeMax);
  const normalizedMarkers = markers
    .filter((marker) => Number.isFinite(marker.value) && marker.value > 0)
    .map((marker) => ({
      ...marker,
      position: percent(marker.value, safeMax),
    }));

  return (
    <div className={styles.viewport}>
      <div
        className={styles.canvas}
        style={{ "--mission-track-min-width": `${minWidth}px` } as CSSProperties}
      >
        <div
          className={styles.track}
          role="progressbar"
          aria-label={accessibilityLabel}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          aria-valuenow={safeValue}
        >
          <span className={styles.fill} style={{ width: `${progress}%` }} />
          {normalizedMarkers.map((marker) => (
            <span
              key={`marker:${marker.key}`}
              className={`${styles.marker}${marker.achieved ? ` ${styles.markerAchieved}` : ""}`}
              style={{ left: `${marker.position}%` }}
              aria-hidden="true"
            />
          ))}
          {representativePet ? (
            <span
              className={styles.pet}
              style={{ left: `${progress}%` }}
              aria-hidden="true"
            >
              <OfficialSlimeSprite
                slimeColor={representativePet.color}
                growthStage={representativePet.growthStage}
                equippedFloor="none"
                action="idle"
                scale={1}
                alt=""
              />
            </span>
          ) : null}
        </div>

        <ol className={styles.rewards} aria-label="단계별 보상">
          {normalizedMarkers.map((marker) => {
            const edgeClass =
              marker.position <= 4
                ? styles.rewardStart
                : marker.position >= 96
                  ? styles.rewardEnd
                  : "";
            return (
              <li
                key={`reward:${marker.key}`}
                className={`${styles.reward}${edgeClass ? ` ${edgeClass}` : ""}`}
                style={{ left: `${marker.position}%` }}
              >
                <span className={styles.rewardLabel}>{marker.label}</span>
                <div className={styles.rewardContent}>{marker.content}</div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
