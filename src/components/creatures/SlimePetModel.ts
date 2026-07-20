import {
  SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS,
  type SlimeGrowthSnapshot,
  type SlimeGrowthStage,
} from "@/lib/pets/growth";
import type {
  SlimeColor,
  SlimeEffectKey,
  SlimeShopCategory,
} from "@/lib/pets/types";

export const EFFECT_LABELS: Record<SlimeEffectKey, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 제출 보상",
  comment_reward: "댓글 보상",
};

export type ShopFilter = "slimes" | "all" | SlimeShopCategory;

export const SHOP_CATEGORY_LABELS: Record<ShopFilter, string> = {
  slimes: "슬라임",
  all: "전체",
  background: "배경",
  ride: "탈 것",
  drink: "음료",
};

export type SlimeGrowthSnapshotPayload = Pick<
  SlimeGrowthSnapshot,
  | "stage"
  | "growthSeconds"
  | "growthRemainderBps"
  | "growthAppliedSpeedBps"
  | "nextStage"
  | "remainingSeconds"
  | "remainingMinutes"
> & {
  growthLastSettledAt?: string | Date;
  lastSettledAt?: string | Date;
  appliedSpeedBps?: number;
};

/**
 * Return the percentage completed within the current growth stage.
 *
 * The API snapshot stores cumulative effective seconds, so each stage starts
 * at its persisted threshold rather than at zero.  Keep the stage-3 state
 * complete even if an older row has not yet reached the final threshold, and
 * clamp malformed/temporarily stale values so the UI never renders an
 * impossible meter width or ARIA value.
 */
export function calculateSlimeGrowthPercent(
  snapshot: Pick<SlimeGrowthSnapshotPayload, "stage" | "growthSeconds">,
): number {
  const stage = snapshot.stage >= 3 ? 3 : snapshot.stage >= 2 ? 2 : 1;
  if (stage === 3) return 100;

  const currentStage = stage as SlimeGrowthStage;
  const nextStage = (stage + 1) as SlimeGrowthStage;
  const start = SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS[currentStage];
  const target = SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS[nextStage];
  const seconds = Number.isFinite(snapshot.growthSeconds)
    ? snapshot.growthSeconds
    : start;
  const span = target - start;
  if (span <= 0) return 100;

  return Math.min(100, Math.max(0, Math.round(((seconds - start) / span) * 100)));
}

export type EquippedItemsByColor = Partial<Record<SlimeColor, string[]>>;

export type Notice = { kind: "success" | "error"; text: string };
