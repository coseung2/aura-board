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

export type ClaimedTitle = {
  key: string;
  label: string;
  imagePath: string;
  effectKey: string;
  buffBps: number;
};

export const EFFECT_LABELS: Record<SlimeEffectKey, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 제출 보상",
  comment_reward: "댓글 보상",
};

/**
 * Top-level shop navigation mirrors the mobile product tabs.
 * Background is catalog-gated so empty remote catalogs stay hidden.
 */
export type ShopFilter =
  | "all"
  | "character"
  | "background"
  | "floor"
  | "vehicle"
  | "food"
  | "prop"
  | "outfit";

export const SHOP_NAV_ITEMS: readonly { key: ShopFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "character", label: "캐릭터" },
  { key: "floor", label: "바닥" },
  { key: "vehicle", label: "탈것" },
  { key: "food", label: "먹이" },
  { key: "prop", label: "소품" },
  { key: "outfit", label: "착장" },
];

export type WardrobeFilter =
  | "background"
  | "floor"
  | "vehicle"
  | "drink"
  | "prop"
  | "outfit"
  | "title";

export const WARDROBE_NAV_ITEMS: readonly {
  key: WardrobeFilter;
  label: string;
}[] = [
  { key: "floor", label: "바닥" },
  { key: "vehicle", label: "탈것" },
  { key: "drink", label: "음료" },
  { key: "prop", label: "소품" },
  { key: "outfit", label: "착장" },
  { key: "title", label: "칭호" },
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
};

export const SLIME_SHOP_TIER_LABEL_BY_PRICE: Readonly<Record<number, string>> = {
  500: "기본",
  700: "고급",
  1_000: "최고급",
};

export type SlimeShopTierGroup<T> = Readonly<{
  price: number;
  label: string;
  items: readonly T[];
}>;

/** Background tab is catalog-gated so empty remote catalogs stay hidden. */
export function slimeShopNavItems(
  catalog: readonly Pick<SlimeShopItem, "category" | "floor">[],
): readonly { key: ShopFilter; label: string }[] {
  const hasBackground = catalog.some((item) => isSlimeSceneBackground(item));
  if (!hasBackground) return SHOP_NAV_ITEMS;
  return [
    SHOP_NAV_ITEMS[0]!,
    { key: "background", label: "배경" },
    ...SHOP_NAV_ITEMS.slice(1),
  ];
}

export function slimeWardrobeNavItems(
  catalog: readonly Pick<SlimeShopItem, "category" | "floor">[],
): readonly { key: WardrobeFilter; label: string }[] {
  const hasBackground = catalog.some((item) => isSlimeSceneBackground(item));
  if (!hasBackground) return WARDROBE_NAV_ITEMS;
  return [{ key: "background", label: "배경" }, ...WARDROBE_NAV_ITEMS];
}

/** Map API/catalog categories to the semantic top-level shop tab. */
export function shopFilterForItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): Exclude<ShopFilter, "character"> {
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
    default:
      // Unknown shop categories are still useful in the catch-all prop tab;
      // this keeps a newly imported item visible while its folder is wired up.
      return "prop";
  }
}

export function wardrobeFilterForItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): Exclude<WardrobeFilter, "title"> {
  if (isSlimeSceneBackground(item)) return "background";
  if (item.floor || item.category === "background") return "floor";
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "drink") return "drink";
  if (item.category === "wearable") return "outfit";
  return "prop";
}

export function shopItemCategoryLabel(
  item: Pick<SlimeShopItem, "category" | "floor">,
): string {
  return SHOP_CATEGORY_LABELS[shopFilterForItem(item)];
}

/**
 * Group shop items into price bands, cheapest band first.
 *
 * Free items (price zero or missing) are grouped with the cheapest paid band.
 * A list with fewer than two distinct prices returns one unlabelled group.
 */
export function groupSlimeShopItemsByTier<T extends { price?: number }>(
  items: readonly T[],
): readonly SlimeShopTierGroup<T>[] {
  const priceOf = (item: T) =>
    Number.isFinite(item.price) ? Number(item.price) : 0;
  const paidPrices = [
    ...new Set(items.map(priceOf).filter((price) => price > 0)),
  ].sort((a, b) => a - b);
  if (paidPrices.length <= 1) {
    return items.length > 0
      ? [{ price: paidPrices[0] ?? 0, label: "", items }]
      : [];
  }

  const cheapest = paidPrices[0]!;
  return paidPrices.map((price) => ({
    price,
    label: SLIME_SHOP_TIER_LABEL_BY_PRICE[price] ?? `${price.toLocaleString("ko-KR")}원`,
    items: items.filter((item) => {
      const itemPrice = priceOf(item);
      return itemPrice === price || (itemPrice <= 0 && price === cheapest);
    }),
  }));
}

export type SlimePropGroupKey = "drink" | "ride" | "ball";

export const SLIME_PROP_GROUPS = [
  { key: "ball", label: "공" },
  { key: "drink", label: "음료" },
  { key: "ride", label: "탈것" },
] as const satisfies readonly { key: SlimePropGroupKey; label: string }[];

export function propGroupForItem(
  item: Pick<SlimeShopItem, "category" | "key">,
): SlimePropGroupKey {
  if (item.category === "drink") return "drink";
  if (item.category === "ride" || item.category === "vehicle") return "ride";
  if (item.key.startsWith("slime-ball-")) return "ball";
  return "ball";
}

export function groupSlimePropsByKind<T extends Pick<SlimeShopItem, "category" | "key">>(
  items: readonly T[],
): readonly { key: SlimePropGroupKey; label: string; items: readonly T[] }[] {
  return SLIME_PROP_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: items.filter((item) => propGroupForItem(item) === group.key),
  })).filter((group) => group.items.length > 0);
}

export const SLIME_OUTFIT_GROUPS = [
  { role: "blush", label: "볼터치" },
  { role: "eyewear", label: "안경" },
  { role: "headwear", label: "모자" },
] as const;

export function groupSlimeOutfitsByRole<
  T extends { wearableRole?: "blush" | "eyewear" | "headwear" | null },
>(items: readonly T[]): readonly {
  role: "blush" | "eyewear" | "headwear";
  label: string;
  items: readonly T[];
}[] {
  const known = new Set(SLIME_OUTFIT_GROUPS.map((group) => group.role));
  const groups = SLIME_OUTFIT_GROUPS.map((group) => ({
    role: group.role,
    label: group.label,
    items: items.filter((item) => item.wearableRole === group.role),
  }));
  const unclassified = items.filter(
    (item) => !item.wearableRole || !known.has(item.wearableRole),
  );
  if (unclassified.length > 0) {
    const last = groups[groups.length - 1]!;
    groups[groups.length - 1] = {
      ...last,
      items: [...last.items, ...unclassified],
    };
  }
  return groups.filter((group) => group.items.length > 0);
}

/** Resolve equipped item keys into the independent wearable slots. */
export function slimeWearablesFromItems(
  items: readonly SlimeShopItem[],
): SlimeWearableSelection {
  const wearableSelection = normalizeEquippedWearables(
    items.map((item) => item.key),
  );
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
