import type { EquippedFloor } from "./slime-assets";
import type { SlimeColor } from "./slime-assets";

export const SLIME_COLOR_LABELS: Record<SlimeColor, string> = {
  blue: "블루",
  green: "그린",
  yellow: "옐로",
  purple: "퍼플",
  red: "레드",
};

export const SLIME_COLOR_SWATCHES: Record<SlimeColor, string> = {
  blue: "#44a9dc",
  green: "#49b877",
  yellow: "#f4c94e",
  purple: "#9d7bce",
  red: "#e46a62",
};

export const SLIME_STAGE_LABELS: Record<1 | 2 | 3, string> = {
  1: "기본",
  2: "은 왕관 · 파랑 보석",
  3: "금 왕관 · 빨강 보석",
};

export type SlimeGrowth = {
  stage: 1 | 2 | 3;
  growthSeconds: number;
  growthAppliedSpeedBps: number;
  remainingSeconds: number;
  remainingMinutes: number;
};

export type SlimeCatalogItem = {
  key: SlimeColor;
  color: SlimeColor;
  nameKo: string;
  effectKey: string;
  baseBuffBps: number;
  price: number;
  purchaseCount?: number;
};

export type SlimeShopTier = 1 | 2 | 3;

export type SlimeShopItem = {
  key: string;
  category:
    | "background"
    | "ride"
    | "vehicle"
    | "drink"
    | "food"
    | "prop"
    | "wearable"
    | "level-up";
  floor: Exclude<EquippedFloor, "none"> | null;
  labelKo: string;
  price: number;
  tier?: SlimeShopTier;
  spritePath: string;
  mobileSpritePath?: string;
  staticSpritePath?: string;
  animationKey?: string;
  previewColor?: SlimeColor;
  wearableRole?: SlimeWearableRole;
  wearableOption?: string;
  /** Public manifest for wearables not bundled in this installed app. */
  wearableAssetPath?: string;
  /** Vehicle stance; `floating` rides never touch the floor surface. */
  vehicleStance?: "grounded" | "floating";
  /** Pixels the vehicle lifts the slime, in 64px-viewport units. */
  vehicleRiseY?: number;
  /** Horizontal delivery correction for vehicle-owned layers only. */
  vehicleOffsetX?: number;
  /** Vehicle parts that stay planted while the body moves, such as wheels. */
  vehicleGroundedSpritePath?: string;
  /** Transparent effect sheets synchronized to the vehicle's main frame clock. */
  vehicleEffectSpritePaths?: string[];
  /** Frames in the vehicle sheet. Omitted means a single static image. */
  vehicleFrameCount?: number;
  /** Frames in the grounded-part sheet, such as a wheel rotation. */
  vehicleGroundedFrameCount?: number;
  /** Fixed frame duration for the grounded part, in milliseconds. */
  vehicleGroundedFrameDurationMs?: number;
  /** Height of the vehicle canvas; taller than the viewport when art needs headroom. */
  vehicleCanvasHeight?: number;
  /** Where the character sits inside a taller vehicle canvas. */
  vehicleCharacterOffsetY?: number;
  /** Per-frame vertical bob authored into the vehicle. The rider follows it. */
  vehicleBobY?: number[];
  /** Animated vehicle sheet; `spritePath` stays the still shop image. */
  vehicleSheetPath?: string;
  effectKey?: string;
  effectBps?: number;
  purchaseCount?: number;
};

export const SLIME_WEARABLE_ROLES = ["blush", "eyewear", "headwear"] as const;

export type SlimeWearableRole = (typeof SLIME_WEARABLE_ROLES)[number];

export type MobileSlimeWearableSelection = {
  blush: string | null;
  eyewear: string | null;
  headwear: string | null;
  drink: string | null;
  assetPaths: Partial<Record<SlimeWearableRole, string>>;
};

export type SlimeShopFilter =
  | "all"
  | "character"
  | "background"
  | "floor"
  | "vehicle"
  | "food"
  | "prop"
  | "outfit"
  | "level-up";

export const SLIME_SHOP_NAV_ITEMS: readonly {
  key: SlimeShopFilter;
  label: string;
}[] = [
  { key: "all", label: "전체" },
  { key: "character", label: "캐릭터" },
  { key: "floor", label: "바닥" },
  { key: "vehicle", label: "탈것" },
  { key: "food", label: "먹이" },
  { key: "prop", label: "소품" },
  { key: "outfit", label: "착장" },
];

export type SlimeVisualItemSlot =
  | "background"
  | "floor"
  | "vehicle"
  | "prop"
  | SlimeWearableRole;

/** True scene backgrounds are category background with no floor mapping. */
export function isSceneBackgroundItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): boolean {
  return item.category === "background" && item.floor === null;
}

export function catalogHasSceneBackgrounds(
  catalog: readonly Pick<SlimeShopItem, "category" | "floor">[],
): boolean {
  return catalog.some((item) => isSceneBackgroundItem(item));
}

/** Background tab is catalog-gated so empty remote catalogs stay hidden. */
export function slimeShopNavItems(
  catalog: readonly Pick<SlimeShopItem, "category" | "floor">[],
): readonly { key: SlimeShopFilter; label: string }[] {
  if (!catalogHasSceneBackgrounds(catalog)) return SLIME_SHOP_NAV_ITEMS;
  return [
    SLIME_SHOP_NAV_ITEMS[0]!,
    { key: "background", label: "배경" },
    ...SLIME_SHOP_NAV_ITEMS.slice(1),
  ];
}

/** Visual slots keep at most one equipped key in each independent slot. */
export function slimeVisualItemSlot(
  item: Pick<SlimeShopItem, "category" | "floor" | "wearableRole">,
): SlimeVisualItemSlot | null {
  if (isSceneBackgroundItem(item)) return "background";
  if (item.floor) return "floor";
  // Vehicles ride above the floor rather than replacing it, so they hold an
  // independent slot and stay equippable next to a background and a floor.
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "drink" || item.category === "prop") return "prop";
  if (item.category === "wearable") return item.wearableRole ?? null;
  return null;
}

/**
 * Label for each shop price point.
 *
 * Bound to the price rather than to a band's position, because a list may not
 * contain every price. The wizard hat is the only 1,000-won outfit, so if labels
 * followed position it would read as the second band ("고급") in a two-band list
 * while the same price reads as "최고급" among backgrounds.
 */
export const SLIME_SHOP_TIER_LABEL_BY_PRICE: Readonly<Record<number, string>> =
  {
    500: "기본",
    700: "고급",
    1_000: "최고급",
  };

export type SlimeShopTierGroup<T> = Readonly<{
  /** Ascending price for this band. */
  price: number;
  label: string;
  items: readonly T[];
}>;

/**
 * Group shop items into price bands, cheapest band first.
 *
 * Free items (price zero or missing) are grouped with the cheapest paid band
 * rather than given a band of their own, since they read as starter content.
 * Item order inside a band is preserved from the catalog.
 *
 * A list with fewer than two distinct prices returns a single unlabelled group,
 * so a uniformly priced category renders exactly as it did before grouping.
 */
/**
 * Outfit sub-categories, in display order.
 *
 * Outfits occupy independent slots, so a slime can wear one of each at the same
 * time. Grouping by slot is what makes the list answer "what can I put on my
 * head" rather than mixing unrelated slots together.
 */
/**
 * Prop sub-categories, in display order.
 *
 * Props are a mixed bag: a drink the slime holds, a ride it plays on, and a ball
 * it is hit by. Grouping them keeps the tab readable as it grows.
 */
export const SLIME_PROP_GROUPS = [
  { key: "drink", label: "음료" },
  { key: "ride", label: "탈것" },
  { key: "ball", label: "공" },
] as const;

export type SlimePropGroupKey = (typeof SLIME_PROP_GROUPS)[number]["key"];

/** Which prop sub-category an item belongs to. */
export function propGroupForItem(
  item: Pick<SlimeShopItem, "category" | "key">,
): SlimePropGroupKey {
  if (item.category === "drink") return "drink";
  if (item.category === "ride") return "ride";
  return "ball";
}

export type SlimePropGroup<T> = Readonly<{
  key: SlimePropGroupKey;
  label: string;
  items: readonly T[];
}>;

/** Split props into their sub-categories, dropping empty ones. */
export function groupSlimePropsByKind<
  T extends Pick<SlimeShopItem, "category" | "key">,
>(items: readonly T[]): readonly SlimePropGroup<T>[] {
  return SLIME_PROP_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: items.filter((item) => propGroupForItem(item) === group.key),
  })).filter((group) => group.items.length > 0);
}

export const SLIME_OUTFIT_GROUPS = [
  { role: "headwear", label: "모자" },
  { role: "eyewear", label: "안경" },
  { role: "blush", label: "볼터치" },
] as const satisfies readonly { role: SlimeWearableRole; label: string }[];

export type SlimeOutfitGroup<T> = Readonly<{
  role: SlimeWearableRole;
  label: string;
  items: readonly T[];
}>;

/**
 * Split outfits into their slot sub-categories, dropping empty ones.
 *
 * Items whose slot is unknown are appended under the last group rather than
 * silently disappearing, so a newly added role is visible before it gets its own
 * entry above.
 */
export function groupSlimeOutfitsByRole<
  T extends {
    category?: string;
    floor?: unknown;
    wearableRole?: SlimeWearableRole | null;
  },
>(items: readonly T[]): readonly SlimeOutfitGroup<T>[] {
  const known = new Set<SlimeWearableRole>(
    SLIME_OUTFIT_GROUPS.map((group) => group.role),
  );
  const groups = SLIME_OUTFIT_GROUPS.map((group) => ({
    role: group.role,
    label: group.label,
    items: items.filter((item) => item.wearableRole === group.role),
  }));
  const unclassified = items.filter(
    (item) => !item.wearableRole || !known.has(item.wearableRole),
  );
  if (unclassified.length > 0) {
    const last = groups[groups.length - 1];
    groups[groups.length - 1] = {
      ...last,
      items: [...last.items, ...unclassified],
    };
  }
  return groups.filter((group) => group.items.length > 0);
}

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

  const cheapest = paidPrices[0];
  return paidPrices
    .map((price) => ({
      price,
      // An unlabelled price falls back to the amount rather than borrowing a
      // neighbouring band's name.
      label:
        SLIME_SHOP_TIER_LABEL_BY_PRICE[price] ?? `${price.toLocaleString()}원`,
      items: items.filter((item) => {
        const itemPrice = priceOf(item);
        return itemPrice === price || (itemPrice <= 0 && price === cheapest);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function resolveSlimeRemoteSpriteUri(
  spritePath: string,
  apiBase: string,
): string {
  const trimmed = spritePath.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  return `${base}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

export function resolveEquippedSceneBackground(
  itemKeys: readonly string[],
  catalog: readonly SlimeShopItem[],
): SlimeShopItem | null {
  const byKey = new Map(catalog.map((item) => [item.key, item]));
  let equipped: SlimeShopItem | null = null;
  for (const key of itemKeys) {
    const item = byKey.get(key);
    if (item && isSceneBackgroundItem(item)) equipped = item;
  }
  return equipped;
}

export function selectSceneBackgroundSpritePath(
  item: Pick<SlimeShopItem, "mobileSpritePath" | "spritePath">,
): string {
  return item.mobileSpritePath || item.spritePath;
}

/**
 * Vehicle currently equipped, if any.
 *
 * Mirrors the scene-background resolver: last matching key wins so a legacy row
 * carrying more than one vehicle still resolves deterministically.
 */
export function resolveEquippedVehicle(
  itemKeys: readonly string[],
  catalog: readonly SlimeShopItem[],
): SlimeShopItem | null {
  const byKey = new Map(catalog.map((item) => [item.key, item]));
  let equipped: SlimeShopItem | null = null;
  for (const key of itemKeys) {
    const item = byKey.get(key);
    if (item && slimeVisualItemSlot(item) === "vehicle") equipped = item;
  }
  return equipped;
}

export const SLIME_COOKIE_ITEM_KEY = "slime-cookie";

/**
 * Mirrors the server-side cap in `src/lib/pets/catalog.ts`, so a mistyped
 * quantity cannot drain a student's wallet in a single tap.
 */
export const SLIME_MAX_PURCHASE_QUANTITY = 99;

export function slimeBallSpritePath(
  itemKeys: readonly string[],
  slimeColor: SlimeColor,
): string | undefined {
  const key = itemKeys.find((itemKey) => itemKey.startsWith("slime-ball-"));
  if (!key) return undefined;
  const slug = key.slice("slime-ball-".length);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  return `/creatures/slimes/official/props/ball/${slug}/${slimeColor}/slime-${slimeColor}-${slug}-hit-4x.gif`;
}

export function slimeDrinkSpritePath(
  item: Pick<SlimeShopItem, "category" | "animationKey">,
  slimeColor: SlimeColor,
  highDensity = true,
): string | undefined {
  if (item.category !== "drink" || !item.animationKey) return undefined;
  const base = `slime-${slimeColor}-drink-${item.animationKey}`;
  return `/creatures/slimes/shop/drinks/${item.animationKey}/${slimeColor}/${base}${highDensity ? "-4x" : ""}.gif`;
}

export function slimeShopPreviewColor(
  item: Pick<SlimeShopItem, "previewColor">,
  fallback: SlimeColor,
): SlimeColor {
  return item.previewColor ?? fallback;
}

/** Resolve the independent wearable slots and the prop-driven drink flavor. */
export function resolveEquippedSlimeWearables(
  itemKeys: readonly string[],
  catalog: readonly SlimeShopItem[],
): MobileSlimeWearableSelection {
  const byKey = new Map(catalog.map((item) => [item.key, item]));
  const selection: MobileSlimeWearableSelection = {
    blush: null,
    eyewear: null,
    headwear: null,
    drink: null,
    assetPaths: {},
  };

  for (const itemKey of itemKeys) {
    const item = byKey.get(itemKey);
    if (!item) continue;
    if (item.category === "drink") {
      if (item.animationKey) selection.drink = item.animationKey;
      continue;
    }
    if (
      item.category !== "wearable" ||
      !item.wearableRole ||
      !item.wearableOption
    ) {
      continue;
    }
    selection[item.wearableRole] = item.wearableOption;
    if (item.wearableAssetPath) {
      selection.assetPaths[item.wearableRole] = item.wearableAssetPath;
    }
  }

  return selection;
}

export function studentPetHref(section: "mine" | "classroom"): string {
  return `/(student)/slime?section=${section}`;
}
