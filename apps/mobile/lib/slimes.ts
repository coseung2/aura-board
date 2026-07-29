import {
  EQUIPPED_FLOORS,
  SLIME_ASSET_COLORS,
  type EquippedFloor,
  type SlimeColor,
  type SlimeEvolution,
} from "./slime-assets";

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

export type MobileSlimeEffect = {
  source: string;
  key: string;
  label: string;
  effectKey: string;
  bps: number;
};

export type MobileSlimeBuffGroup = {
  color: SlimeColor;
  label: string;
  entries: MobileSlimeEffect[];
  totals: Array<Pick<MobileSlimeEffect, "effectKey" | "bps">>;
};

export const MOBILE_SLIME_EFFECT_KEYS = [
  "growth_speed",
  "reading_reward",
  "walking_reward",
  "assignment_reward",
  "comment_reward",
] as const;

export type MobileSlimeEffectKey = typeof MOBILE_SLIME_EFFECT_KEYS[number];

export type SlimeCatalogItem = {
  key: SlimeColor;
  color: SlimeColor;
  nameKo: string;
  effectKey: string;
  baseBuffBps: number;
  price: number;
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
};

export const SLIME_WEARABLE_ROLES = ["blush", "eyewear", "headwear"] as const;
export type SlimeWearableRole = (typeof SLIME_WEARABLE_ROLES)[number];

export type MobileSlimeWearableSelection = {
  blush: string | null;
  eyewear: string | null;
  headwear: string | null;
  drink: string | null;
};

export type SlimeShopFilter =
  | "character"
  | "background"
  | "floor"
  | "vehicle"
  | "food"
  | "prop"
  | "outfit"
  | "level-up";

export const SLIME_SHOP_NAV_ITEMS: readonly { key: SlimeShopFilter; label: string }[] = [
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
export const SLIME_SHOP_TIER_LABEL_BY_PRICE: Readonly<Record<number, string>> = {
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
export function groupSlimePropsByKind<T extends Pick<SlimeShopItem, "category" | "key">>(
  items: readonly T[],
): readonly SlimePropGroup<T>[] {
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
  T extends { category?: string; floor?: unknown; wearableRole?: SlimeWearableRole | null },
>(items: readonly T[]): readonly SlimeOutfitGroup<T>[] {
  const known = new Set<SlimeWearableRole>(SLIME_OUTFIT_GROUPS.map((group) => group.role));
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
    groups[groups.length - 1] = { ...last, items: [...last.items, ...unclassified] };
  }
  return groups.filter((group) => group.items.length > 0);
}

export function groupSlimeShopItemsByTier<T extends { price?: number }>(
  items: readonly T[],
): readonly SlimeShopTierGroup<T>[] {
  const priceOf = (item: T) => (Number.isFinite(item.price) ? Number(item.price) : 0);
  const paidPrices = [...new Set(items.map(priceOf).filter((price) => price > 0))].sort(
    (a, b) => a - b,
  );
  if (paidPrices.length <= 1) {
    return items.length > 0 ? [{ price: paidPrices[0] ?? 0, label: "", items }] : [];
  }

  const cheapest = paidPrices[0];
  return paidPrices
    .map((price) => ({
      price,
      // An unlabelled price falls back to the amount rather than borrowing a
      // neighbouring band's name.
      label: SLIME_SHOP_TIER_LABEL_BY_PRICE[price] ?? `${price.toLocaleString()}원`,
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
  }

  return selection;
}

export function studentPetHref(section: "mine" | "classroom"): string {
  return `/(student)/slime?section=${section}`;
}

export type MobileSlimeHome = {
  balance: number;
  unitLabel: string;
  ownedColors: SlimeColor[];
  equippedColors: SlimeColor[];
  representativeColor: SlimeColor | null;
  catalog: SlimeCatalogItem[];
  ownedItemKeys: string[];
  ownedItemQuantities: Record<string, number>;
  equippedItemKeys: string[];
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>;
  /** Equipped items hidden from sprite composition; buffs still use equipped keys. */
  hiddenItemKeys: string[];
  hiddenItemsByColor: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor: Partial<Record<SlimeColor, EquippedFloor>>;
  equippedFloor: EquippedFloor;
  shopCatalog: SlimeShopItem[];
  growthSpeedBps: number;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowth>>;
  effects: { breakdown: MobileSlimeEffect[] };
  walkingTitle: MobileWalkingTitle | null;
  claimedTitles: MobileClaimedTitle[];
  equippedTitleByColor: Partial<Record<SlimeColor, string>>;
};

export type MobileClaimedTitle = {
  key: string;
  label: string;
  imagePath: string;
  effectKey: string;
  buffBps: number;
};

export type MobileSlimeClassmate = {
  id: string;
  number: number | null;
  name: string;
  walkingTitle: MobileWalkingTitle | null;
  representative: {
    color: SlimeColor;
    growthStage: 1 | 2 | 3;
    equippedItemKeys: string[];
    hiddenItemKeys: string[];
    equippedTitleKey: string | null;
  } | null;
};

export type MobileWalkingTitle = {
  key: string;
  label: string;
  imagePath: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

function color(value: unknown): SlimeColor | null {
  return typeof value === "string" && (SLIME_ASSET_COLORS as readonly string[]).includes(value)
    ? (value as SlimeColor)
    : null;
}

function wearableRole(value: unknown): SlimeWearableRole | null {
  return typeof value === "string" &&
    (SLIME_WEARABLE_ROLES as readonly string[]).includes(value)
    ? (value as SlimeWearableRole)
    : null;
}

function floor(value: unknown): EquippedFloor {
  return typeof value === "string" && (EQUIPPED_FLOORS as readonly string[]).includes(value)
    ? (value as EquippedFloor)
    : "none";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function colorsList(value: unknown): SlimeColor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(color)
    .filter((item): item is SlimeColor => item !== null);
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stageValue(value: unknown): 1 | 2 | 3 {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

function walkingTitle(value: unknown): MobileWalkingTitle | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.key !== "string" ||
    typeof value.label !== "string" ||
    typeof value.imagePath !== "string"
  ) {
    return null;
  }
  return { key: value.key, label: value.label, imagePath: value.imagePath };
}

function normalizeGrowth(value: unknown): SlimeGrowth {
  const item = isRecord(value) ? value : {};
  return {
    stage: stageValue(item.stage),
    growthSeconds: Math.max(0, Math.trunc(numberValue(item.growthSeconds))),
    growthAppliedSpeedBps: Math.max(
      0,
      Math.trunc(numberValue(item.growthAppliedSpeedBps ?? item.appliedSpeedBps)),
    ),
    remainingSeconds: Math.max(0, Math.trunc(numberValue(item.remainingSeconds))),
    remainingMinutes: Math.max(0, Math.trunc(numberValue(item.remainingMinutes))),
  };
}

function normalizeEffects(value: unknown): { breakdown: MobileSlimeEffect[] } {
  if (!isRecord(value) || !Array.isArray(value.breakdown)) return { breakdown: [] };
  return {
    breakdown: value.breakdown.flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.source !== "string" ||
        typeof entry.key !== "string" ||
        typeof entry.label !== "string" ||
        typeof entry.effectKey !== "string"
      ) {
        return [];
      }
      return [{
        source: entry.source,
        key: entry.key,
        label: entry.label,
        effectKey: entry.effectKey,
        bps: Math.max(0, Math.trunc(numberValue(entry.bps))),
      }];
    }),
  };
}

function normalizeCatalog(value: unknown): SlimeCatalogItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const itemColor = color(entry.color ?? entry.key);
    if (!itemColor) return [];
    return [
      {
        key: itemColor,
        color: itemColor,
        nameKo:
          typeof entry.nameKo === "string"
            ? entry.nameKo
            : `${SLIME_COLOR_LABELS[itemColor]} 슬라임`,
        effectKey: typeof entry.effectKey === "string" ? entry.effectKey : "",
        baseBuffBps: Math.max(0, Math.trunc(numberValue(entry.baseBuffBps))),
        price: Math.max(0, Math.trunc(numberValue(entry.price))),
      },
    ];
  });
}

function normalizeShopCatalog(value: unknown): SlimeShopItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.key !== "string") return [];
    const category = entry.category;
    if (
      category !== "background" &&
      category !== "ride" &&
      category !== "vehicle" &&
      category !== "drink" &&
      category !== "food" &&
      category !== "prop" &&
      category !== "wearable" &&
      category !== "level-up"
    ) {
      return [];
    }
    const parsedFloor = entry.floor === null ? "none" : floor(entry.floor);
    const itemFloor = parsedFloor === "none" ? null : parsedFloor;
    const parsedWearableRole = wearableRole(entry.wearableRole);
    const tier =
      entry.tier === 1 || entry.tier === 2 || entry.tier === 3
        ? entry.tier
        : undefined;
    return [
      {
        key: entry.key,
        category,
        floor: itemFloor,
        labelKo: typeof entry.labelKo === "string" ? entry.labelKo : entry.key,
        price: Math.max(0, Math.trunc(numberValue(entry.price))),
        tier,
        spritePath: typeof entry.spritePath === "string" ? entry.spritePath : "",
        mobileSpritePath:
          typeof entry.mobileSpritePath === "string" ? entry.mobileSpritePath : undefined,
        staticSpritePath:
          typeof entry.staticSpritePath === "string" ? entry.staticSpritePath : undefined,
        animationKey:
          typeof entry.animationKey === "string" ? entry.animationKey : undefined,
        previewColor: SLIME_ASSET_COLORS.includes(entry.previewColor as SlimeColor)
          ? entry.previewColor as SlimeColor
          : undefined,
        wearableRole: parsedWearableRole ?? undefined,
        wearableOption:
          typeof entry.wearableOption === "string" && entry.wearableOption.length > 0
            ? entry.wearableOption
            : undefined,
        // Vehicle fields have to survive normalization or the ride never renders
        // on mobile even though the server sent it.
        vehicleStance:
          entry.vehicleStance === "grounded" || entry.vehicleStance === "floating"
            ? entry.vehicleStance
            : undefined,
        vehicleRiseY:
          typeof entry.vehicleRiseY === "number"
            ? Math.max(0, Math.trunc(entry.vehicleRiseY))
            : undefined,
        vehicleOffsetX:
          typeof entry.vehicleOffsetX === "number"
            ? Math.trunc(entry.vehicleOffsetX)
            : undefined,
        vehicleGroundedSpritePath:
          typeof entry.vehicleGroundedSpritePath === "string"
            ? entry.vehicleGroundedSpritePath
            : undefined,
        vehicleEffectSpritePaths: Array.isArray(entry.vehicleEffectSpritePaths)
          ? entry.vehicleEffectSpritePaths.filter(
              (path): path is string => typeof path === "string" && path.length > 0,
            )
          : undefined,
        vehicleFrameCount:
          typeof entry.vehicleFrameCount === "number"
            ? Math.max(1, Math.trunc(entry.vehicleFrameCount))
            : undefined,
        vehicleGroundedFrameCount:
          typeof entry.vehicleGroundedFrameCount === "number"
            ? Math.max(1, Math.trunc(entry.vehicleGroundedFrameCount))
            : undefined,
        vehicleGroundedFrameDurationMs:
          typeof entry.vehicleGroundedFrameDurationMs === "number"
            ? Math.max(16, Math.trunc(entry.vehicleGroundedFrameDurationMs))
            : undefined,
        vehicleCanvasHeight:
          typeof entry.vehicleCanvasHeight === "number"
            ? Math.max(64, Math.trunc(entry.vehicleCanvasHeight))
            : undefined,
        vehicleCharacterOffsetY:
          typeof entry.vehicleCharacterOffsetY === "number"
            ? Math.max(0, Math.trunc(entry.vehicleCharacterOffsetY))
            : undefined,
        vehicleBobY: Array.isArray(entry.vehicleBobY)
          ? entry.vehicleBobY
              .filter((value): value is number => typeof value === "number")
              .map((value) => Math.trunc(value))
          : undefined,
        vehicleSheetPath:
          typeof entry.vehicleSheetPath === "string" ? entry.vehicleSheetPath : undefined,
        effectKey: typeof entry.effectKey === "string" ? entry.effectKey : undefined,
        effectBps:
          typeof entry.effectBps === "number"
            ? Math.max(0, Math.trunc(entry.effectBps))
            : undefined,
      },
    ];
  });
}

function normalizeItemsByColor(
  value: unknown,
): Partial<Record<SlimeColor, string[]>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, string[]>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    result[itemColor] = stringList(value[itemColor]);
  }
  return result;
}

function normalizeOptionalItemsByColor(
  value: unknown,
): Partial<Record<SlimeColor, string[]>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, string[]>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (itemColor in value) result[itemColor] = stringList(value[itemColor]);
  }
  return result;
}

function normalizeFloorsByColor(
  value: unknown,
): Partial<Record<SlimeColor, EquippedFloor>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, EquippedFloor>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (value[itemColor] !== undefined) result[itemColor] = floor(value[itemColor]);
  }
  return result;
}

function normalizeQuantities(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(value)) {
    result[key] = Math.max(0, Math.trunc(numberValue(quantity)));
  }
  return result;
}

export function normalizeSlimeHome(payload: unknown): MobileSlimeHome {
  const value = isRecord(payload) ? payload : {};
  const growthSource = isRecord(value.growthByColor)
    ? value.growthByColor
    : isRecord(value.growth)
      ? value.growth
      : {};
  const growthByColor: Partial<Record<SlimeColor, SlimeGrowth>> = {};
  for (const itemColor of SLIME_ASSET_COLORS) {
    if (growthSource[itemColor] !== undefined) {
      growthByColor[itemColor] = normalizeGrowth(growthSource[itemColor]);
    }
  }

  const representativeColor = color(value.representativeColor);
  const equippedFloorByColor = normalizeFloorsByColor(value.equippedFloorByColor);
  const ownedItemKeys = stringList(value.ownedItemKeys);
  const ownedItemQuantities = normalizeQuantities(value.ownedItemQuantities);
  if (
    ownedItemKeys.includes(SLIME_COOKIE_ITEM_KEY) &&
    ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] === undefined
  ) {
    ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] = 1;
  }
  return {
    balance: Math.max(0, Math.trunc(numberValue(value.balance))),
    unitLabel:
      isRecord(value.currency) && typeof value.currency.unitLabel === "string"
        ? value.currency.unitLabel
        : "원",
    ownedColors: colorsList(value.ownedColors),
    equippedColors: colorsList(value.equippedColors),
    representativeColor,
    catalog: normalizeCatalog(value.catalog),
    ownedItemKeys,
    ownedItemQuantities,
    equippedItemKeys: stringList(value.equippedItemKeys),
    equippedItemsByColor: normalizeItemsByColor(value.equippedItemsByColor),
    hiddenItemKeys: stringList(value.hiddenItemKeys),
    hiddenItemsByColor: normalizeOptionalItemsByColor(value.hiddenItemsByColor),
    equippedFloorByColor,
    equippedFloor: floor(value.equippedFloor),
    shopCatalog: normalizeShopCatalog(value.shopCatalog),
    growthSpeedBps: Math.max(0, Math.trunc(numberValue(value.growthSpeedBps))),
    growthByColor,
    effects: normalizeEffects(value.effects),
    walkingTitle: walkingTitle(value.walkingTitle),
    claimedTitles: normalizeClaimedTitles(value.claimedTitles),
    equippedTitleByColor: normalizeTitlesByColor(value.equippedTitleByColor),
  };
}

/**
 * Resolve the buffs worn by each owned pet, then aggregate duplicate effect
 * types within that pet. The detailed entries feed the arrow popover while
 * totals feed the compact summary below the pet grid.
 */
export function mobileSlimeBuffGroups(home: MobileSlimeHome): MobileSlimeBuffGroup[] {
  const shopItemsByKey = new Map(home.shopCatalog.map((item) => [item.key, item]));
  const claimedTitlesByKey = new Map(home.claimedTitles.map((title) => [title.key, title]));

  return home.ownedColors.flatMap((itemColor) => {
    const slime = home.catalog.find((entry) => entry.color === itemColor);
    if (!slime) return [];

    const entries: MobileSlimeEffect[] = [];
    const baseBps = slimeBuffBpsForStage(slime.baseBuffBps, stageForColor(home, itemColor));
    if (slime.effectKey && baseBps > 0) {
      entries.push({
        source: "slime",
        key: slime.key,
        label: "펫 기본 효과",
        effectKey: slime.effectKey,
        bps: baseBps,
      });
    }

    for (const itemKey of home.equippedItemsByColor[itemColor] ?? []) {
      const item = shopItemsByKey.get(itemKey);
      if (!item?.effectKey || !item.effectBps) continue;
      entries.push({
        source: isSceneBackgroundItem(item) ? "background" : "item",
        key: item.key,
        label: item.labelKo,
        effectKey: item.effectKey,
        bps: item.effectBps,
      });
    }

    const titleKey = home.equippedTitleByColor[itemColor];
    const title = titleKey ? claimedTitlesByKey.get(titleKey) : undefined;
    if (title?.effectKey && title.buffBps > 0) {
      entries.push({
        source: "title",
        key: title.key,
        label: title.label,
        effectKey: title.effectKey,
        bps: title.buffBps,
      });
    }

    const totalsByEffect = new Map<string, number>();
    for (const entry of entries) {
      totalsByEffect.set(entry.effectKey, (totalsByEffect.get(entry.effectKey) ?? 0) + entry.bps);
    }

    return [{
      color: itemColor,
      label: slime.nameKo,
      entries,
      totals: Array.from(totalsByEffect, ([effectKey, bps]) => ({ effectKey, bps })),
    }];
  });
}

/**
 * Outfit family sets, kept in step with the web catalog.
 *
 * Membership is by shop key so a rename of a display label cannot break a set.
 */
const WEARABLE_SETS = [
  {
    key: "beanie-collection",
    labelKo: "비니 컬렉션",
    itemKeys: [
      "slime-headwear-beige-beanie",
      "slime-headwear-brown-beanie",
      "slime-headwear-charcoal-beanie",
      "slime-headwear-ivory-beanie",
    ],
    effectKey: "assignment_reward",
    bps: 200,
  },
  {
    key: "goggles-collection",
    labelKo: "고글 컬렉션",
    itemKeys: [
      "slime-eyewear-black-goggles",
      "slime-eyewear-copper-goggles",
      "slime-eyewear-gold-goggles",
      "slime-eyewear-silver-goggles",
    ],
    effectKey: "reading_reward",
    bps: 200,
  },
  {
    key: "sunglasses-pair",
    labelKo: "선글라스 세트",
    itemKeys: ["slime-eyewear-black-sunglasses", "slime-eyewear-red-sunglasses"],
    effectKey: "reading_reward",
    bps: 100,
  },
  {
    key: "blush-pair",
    labelKo: "볼터치 세트",
    itemKeys: ["slime-blush-peach-brush-blush", "slime-blush-rose-brush-blush"],
    effectKey: "comment_reward",
    bps: 100,
  },
] as const;

export type MobileSlimeActiveSet = Readonly<{
  key: string;
  label: string;
  effectKey: string;
  bps: number;
}>;

/**
 * Sets whose every piece is currently worn, counted across the whole collection.
 *
 * A single slime can only wear one option per slot, so a family is completed by
 * spreading it over several pets: four beanies on four slimes activates the beanie
 * collection. That is why this reads every pet's equipped list rather than one
 * pet's, and why the grid shows the result in one shared cell.
 *
 * Owning a piece is not enough. Leaving it in the wardrobe grants nothing, so the
 * bonus rewards actually dressing the collection.
 */
export function mobileSlimeActiveSets(home: MobileSlimeHome): readonly MobileSlimeActiveSet[] {
  const worn = new Set<string>();
  for (const itemKeys of Object.values(home.equippedItemsByColor ?? {})) {
    for (const itemKey of itemKeys ?? []) worn.add(itemKey);
  }
  return WEARABLE_SETS.filter((set) => set.itemKeys.every((key) => worn.has(key))).map((set) => ({
    key: set.key,
    label: set.labelKo,
    effectKey: set.effectKey,
    bps: set.bps,
  }));
}

/** Aggregate every pet's active buffs into the five product effect areas. */
export function aggregateMobileSlimeBuffTotals(
  groups: readonly MobileSlimeBuffGroup[],
): Array<{ effectKey: MobileSlimeEffectKey; bps: number }> {
  const totals = new Map<MobileSlimeEffectKey, number>(
    MOBILE_SLIME_EFFECT_KEYS.map((effectKey) => [effectKey, 0]),
  );
  for (const group of groups) {
    for (const effect of group.totals) {
      if (!(MOBILE_SLIME_EFFECT_KEYS as readonly string[]).includes(effect.effectKey)) continue;
      const effectKey = effect.effectKey as MobileSlimeEffectKey;
      totals.set(effectKey, (totals.get(effectKey) ?? 0) + effect.bps);
    }
  }
  return MOBILE_SLIME_EFFECT_KEYS.map((effectKey) => ({
    effectKey,
    bps: totals.get(effectKey) ?? 0,
  }));
}

function normalizeClaimedTitles(value: unknown): MobileClaimedTitle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (
      typeof entry.key !== "string" ||
      typeof entry.label !== "string" ||
      typeof entry.imagePath !== "string"
    ) {
      return [];
    }
    return [{
      key: entry.key,
      label: entry.label,
      imagePath: entry.imagePath,
      effectKey: typeof entry.effectKey === "string" ? entry.effectKey : "",
      buffBps: Math.max(0, Math.trunc(numberValue(entry.buffBps))),
    }];
  });
}

function normalizeTitlesByColor(value: unknown): Partial<Record<SlimeColor, string>> {
  if (!isRecord(value)) return {};
  const result: Partial<Record<SlimeColor, string>> = {};
  for (const [key, titleKey] of Object.entries(value)) {
    const slimeColor = color(key);
    if (slimeColor && typeof titleKey === "string" && titleKey.length > 0) {
      result[slimeColor] = titleKey;
    }
  }
  return result;
}

export function normalizeSlimeClassroom(payload: unknown): MobileSlimeClassmate[] {
  if (!isRecord(payload) || !Array.isArray(payload.students)) return [];
  return payload.students.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      return [];
    }
    const representative = isRecord(entry.representative) ? entry.representative : null;
    const representativeColor = representative ? color(representative.color) : null;
    return [{
      id: entry.id,
      number:
        typeof entry.number === "number" && Number.isFinite(entry.number)
          ? Math.trunc(entry.number)
          : null,
      name: entry.name,
      walkingTitle: walkingTitle(entry.walkingTitle),
      representative: representative && representativeColor
        ? {
            color: representativeColor,
            growthStage: stageValue(representative.growthStage),
            equippedItemKeys: stringList(representative.equippedItemKeys),
            hiddenItemKeys: stringList(representative.hiddenItemKeys),
            equippedTitleKey:
              typeof representative.equippedTitleKey === "string"
              && representative.equippedTitleKey.length > 0
                ? representative.equippedTitleKey
                : null,
          }
        : null,
    }];
  });
}

export function shopFilterForItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): Exclude<SlimeShopFilter, "character"> {
  if (isSceneBackgroundItem(item)) return "background";
  // Vehicles are ridden above the floor rather than stood on, so they own the
  // 탈것 tab. `ride` is the pre-vehicle name for the same family.
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "background" || item.floor) return "floor";
  if (item.category === "food") return "food";
  if (item.category === "wearable") return "outfit";
  if (item.category === "level-up") return "level-up";
  return "prop";
}

const STAGE_START_SECONDS: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 10 * 86_400,
  3: 25 * 86_400,
};

export function calculateSlimeGrowthPercent(
  growth: Pick<SlimeGrowth, "stage" | "growthSeconds">,
): number {
  if (growth.stage >= 3) return 100;
  const start = STAGE_START_SECONDS[growth.stage];
  const target = STAGE_START_SECONDS[(growth.stage + 1) as 2 | 3];
  if (target <= start) return 100;
  const percent =
    ((growth.growthSeconds - start) / (target - start)) * 100;
  // Keep one decimal so a small remainder carried into a new stage does not
  // appear to reset to zero after integer rounding.
  return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

/** Stage one uses the catalog base buff; later stages double it each time. */
export function slimeBuffBpsForStage(baseBuffBps: number, stage: 1 | 2 | 3): number {
  const base = Number.isFinite(baseBuffBps) ? Math.max(0, Math.round(baseBuffBps)) : 0;
  return stage === 3 ? base * 4 : stage === 2 ? base * 2 : base;
}

export function calculateGrowthTimeComparison(
  remainingEffectiveSeconds: number,
  growthSpeedBps: number,
) {
  const withoutBuffSeconds = Math.max(0, Math.ceil(remainingEffectiveSeconds));
  const safeBps = Number.isFinite(growthSpeedBps)
    ? Math.max(0, Math.round(growthSpeedBps))
    : 0;
  return {
    withoutBuffSeconds,
    withBuffSeconds: Math.ceil((withoutBuffSeconds * 10_000) / (10_000 + safeBps)),
  };
}

export function formatGrowthHours(seconds: number): string {
  const hours = Math.round((Math.max(0, seconds) / 3_600) * 10) / 10;
  return `${hours.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}시간`;
}

export function evolutionForStage(stage: 1 | 2 | 3): SlimeEvolution {
  if (stage === 3) return "gold-crown-red-gem";
  if (stage === 2) return "silver-crown-blue-gem";
  return "base";
}

export function stageForColor(
  home: MobileSlimeHome,
  itemColor: SlimeColor,
): 1 | 2 | 3 {
  return home.growthByColor[itemColor]?.stage ?? 1;
}

export function floorLabel(itemFloor: Exclude<EquippedFloor, "none">): string {
  const labels: Record<Exclude<EquippedFloor, "none">, string> = {
    "grass-floor": "잔디 바닥",
    "crystal-cave-floor": "수정 동굴 바닥",
    "moonlit-marble-floor": "달빛 대리석 바닥",
    "royal-garden-floor": "왕실 정원 바닥",
    "celestial-gold-floor": "천상의 황금 바닥",
    "snow-ground-floor": "눈밭",
    "ancient-brick-floor": "고대 벽돌 바닥",
    "cherry-stone-floor": "벚꽃 돌바닥",
    "sand-trail-floor": "모래길 바닥",
    "forest-soil-floor": "숲 흙바닥",
    "stone-floor": "돌바닥",
    "water-puddle": "물웅덩이",
    trampoline: "트램펄린",
  };
  return labels[itemFloor];
}

export function newSlimeIdempotencyKey(prefix: string, identity: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${identity}-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
