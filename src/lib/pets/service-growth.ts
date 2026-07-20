import { getSlimeDefinition } from "./catalog";
import {
  calculateSlimeGrowthSnapshot,
  normalizeSlimeGrowthStage,
  type SlimeGrowthSnapshot,
  type SlimeGrowthState,
} from "./growth";
import { calculateCatalogSlimeEffects } from "./math";
import type { SlimeColor } from "./types";

export type SlimeGrowthRow = {
  id: string;
  color: string;
  isEquipped: boolean;
  growthStage: number;
  growthSeconds: number;
  growthRemainderBps: number;
  growthLastSettledAt: Date;
  growthAppliedSpeedBps: number;
};

export const slimeGrowthSelect = {
  id: true,
  color: true,
  isEquipped: true,
  growthStage: true,
  growthSeconds: true,
  growthRemainderBps: true,
  growthLastSettledAt: true,
  growthAppliedSpeedBps: true,
} as const;

export function growthStateFromRow(
  row: SlimeGrowthRow,
  fallbackNow = new Date(),
): SlimeGrowthState {
  return {
    stage: normalizeSlimeGrowthStage(row.growthStage),
    growthSeconds: row.growthSeconds,
    growthRemainderBps: row.growthRemainderBps,
    growthLastSettledAt:
      row.growthLastSettledAt instanceof Date
        ? row.growthLastSettledAt
        : fallbackNow,
    growthAppliedSpeedBps:
      row.isEquipped !== false ? row.growthAppliedSpeedBps : 0,
  };
}

export function growthSnapshotByColor(
  rows: readonly SlimeGrowthRow[],
  now: Date,
): Partial<Record<SlimeColor, SlimeGrowthSnapshot>> {
  const result: Partial<Record<SlimeColor, SlimeGrowthSnapshot>> = {};
  for (const row of rows) {
    const slime = getSlimeDefinition(row.color);
    if (!slime) continue;
    result[slime.color] = calculateSlimeGrowthSnapshot(
      growthStateFromRow(row),
      now,
    );
  }
  return result;
}

export function growthEffectsForColors(equippedColors: readonly SlimeColor[]) {
  return calculateCatalogSlimeEffects(equippedColors, []);
}
