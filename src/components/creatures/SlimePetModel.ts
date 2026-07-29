import {
  SLIME_GROWTH_STAGE_THRESHOLDS_SECONDS,
  type SlimeGrowthSnapshot,
  type SlimeGrowthStage,
} from "@/lib/pets/growth";
import { isSlimeSceneBackground } from "@/lib/pets/catalog";
import { normalizeEquippedWearables } from "@/lib/pets/wearable-catalog";
import type { SlimeWearableSelection } from "@/lib/pets/slime-wearables";
import type {
  SlimeColor,
  SlimeEffectKey,
  SlimeShopItem,
} from "@/lib/pets/types";

export const EFFECT_LABELS: Record<SlimeEffectKey, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 제출 보상",
  comment_reward: "댓글 보상",
};

/**
 * The drawer's top-level navigation follows the folders used by the prop
 * importer. Keep the semantic keys independent from persistence/API
 * categories so new prop families (such as balls) can join an existing tab.
 */
export type ShopFilter =
  | "all"
  | "character"
  | "background"
  | "floor"
  | "vehicle"
  | "food"
  | "prop"
  | "outfit"
  | "level-up";

export const SHOP_NAV_ITEMS: readonly { key: ShopFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "character", label: "캐릭터" },
  { key: "background", label: "배경" },
  { key: "floor", label: "바닥" },
  { key: "vehicle", label: "탈것" },
  { key: "food", label: "먹이" },
  { key: "prop", label: "소품" },
  { key: "outfit", label: "착장" },
  { key: "level-up", label: "레벨업" },
];

export const SLIME_COOKIE_ITEM_KEY = "slime-cookie";

export const SHOP_CATEGORY_LABELS: Record<ShopFilter, string> = {
  all: "전체",
  character: "캐릭터",
  background: "배경",
  floor: "바닥",
  vehicle: "탈것",
  food: "먹이",
  prop: "소품",
  outfit: "착장",
  "level-up": "레벨업",
};

/** Map API/catalog categories to the semantic top-level drawer tab. */
export function shopFilterForItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): Exclude<ShopFilter, "all" | "character"> {
  if (isSlimeSceneBackground(item)) return "background";
  switch (String(item.category)) {
    case "background":
      return "floor";
    // `ride` is the pre-vehicle name for the same family; both land in 탈것.
    case "ride":
    case "vehicle":
      return "vehicle";
    case "food":
      return "food";
    case "drink":
    case "prop":
      return "prop";
    case "wearable":
      return "outfit";
    case "level-up":
      return "level-up";
    default:
      // Unknown shop categories are still useful in the catch-all prop tab;
      // this keeps a newly imported item visible while its folder is wired up.
      return "prop";
  }
}

export function shopItemCategoryLabel(
  item: Pick<SlimeShopItem, "category" | "floor">,
): string {
  return SHOP_CATEGORY_LABELS[shopFilterForItem(item)];
}

/** Resolve equipped item keys into the independent wearable slots. */
export function slimeWearablesFromItems(
  items: readonly SlimeShopItem[],
): SlimeWearableSelection {
  const wearableSelection = normalizeEquippedWearables(items.map((item) => item.key));
  const drink = items.find((item) => item.category === "drink");
  return {
    blush: wearableSelection.blush ?? null,
    eyewear: wearableSelection.eyewear ?? null,
    headwear: wearableSelection.headwear ?? null,
    drink: drink?.animationKey ?? null,
  };
}

const SLIME_BALL_KEY_PREFIX = "slime-ball-";

/** Return a color-matched looping GIF for an equipped ball item. */
export function slimeItemSpritePath(
  item: Pick<SlimeShopItem, "key" | "spritePath">,
  slimeColor: SlimeColor,
): string {
  if (!item.key.startsWith(SLIME_BALL_KEY_PREFIX)) return item.spritePath;
  const slug = item.key.slice(SLIME_BALL_KEY_PREFIX.length);
  if (!/^[a-z0-9-]+$/.test(slug)) return item.spritePath;
  return `/creatures/slimes/official/props/ball/${slug}/${slimeColor}/slime-${slimeColor}-${slug}-hit.gif`;
}

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

  const percent = ((seconds - start) / span) * 100;
  // One decimal keeps stage-boundary overflow visible. Integer rounding made
  // 98.5% read as 99%, then a small carried remainder read as 0% after growth.
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

export function calculateGrowthTimeComparison(
  remainingEffectiveSeconds: number,
  growthSpeedBps: number,
) {
  const withoutBuffSeconds = Math.max(0, Math.ceil(remainingEffectiveSeconds));
  const safeBps = Number.isFinite(growthSpeedBps)
    ? Math.max(0, Math.round(growthSpeedBps))
    : 0;
  const withBuffSeconds = Math.ceil(
    (withoutBuffSeconds * 10_000) / (10_000 + safeBps),
  );
  return { withoutBuffSeconds, withBuffSeconds };
}

export function formatGrowthHours(seconds: number): string {
  const hours = Math.max(0, seconds) / 3_600;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`;
}

export type EquippedItemsByColor = Partial<Record<SlimeColor, string[]>>;

export type Notice = { kind: "success" | "error"; text: string };
