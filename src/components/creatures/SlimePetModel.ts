import type { SlimeGrowthSnapshot } from "@/lib/pets/growth";
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

export type EquippedItemsByColor = Partial<Record<SlimeColor, string[]>>;

export type Notice = { kind: "success" | "error"; text: string };
