import type { EquippedFloor, SlimeColor } from "./slime-assets";
import { resolveEquippedSlimePropAction } from "./slime-props";
import {
  catalogHasSceneBackgrounds,
  isSceneBackgroundItem,
  resolveEquippedSlimeWearables,
  resolveEquippedVehicle,
  shopFilterForItem,
  slimeVisualItemSlot,
  type MobileSlimeHome,
  type SlimeCatalogItem,
  type SlimeShopFilter,
  type SlimeShopItem,
} from "./slimes";

export type SlimeWardrobeFilter =
  | "background"
  | "floor"
  | "vehicle"
  | "drink"
  | "prop"
  | "outfit"
  | "title";

export const SLIME_WARDROBE_NAV_ITEMS: readonly {
  key: SlimeWardrobeFilter;
  label: string;
}[] = [
  { key: "floor", label: "바닥" },
  { key: "vehicle", label: "탈것" },
  { key: "drink", label: "음료" },
  { key: "prop", label: "소품" },
  { key: "outfit", label: "착장" },
  { key: "title", label: "칭호" },
];

const EFFECT_CHIP_LABELS: Readonly<Record<string, string>> = {
  growth_speed: "성장",
  reading_reward: "독서",
  walking_reward: "걷기",
  assignment_reward: "과제",
  comment_reward: "댓글",
};

export function slimeWardrobeNavItems(
  catalog: readonly Pick<SlimeShopItem, "category" | "floor">[],
): readonly { key: SlimeWardrobeFilter; label: string }[] {
  if (!catalogHasSceneBackgrounds(catalog)) return SLIME_WARDROBE_NAV_ITEMS;
  return [
    { key: "background", label: "배경" },
    ...SLIME_WARDROBE_NAV_ITEMS,
  ];
}

export function slimeWardrobeFilterForItem(
  item: Pick<SlimeShopItem, "category" | "floor">,
): Exclude<SlimeWardrobeFilter, "title"> {
  if (isSceneBackgroundItem(item)) return "background";
  if (item.floor || item.category === "background") return "floor";
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "drink") return "drink";
  if (item.category === "wearable") return "outfit";
  return "prop";
}

export function isVehicleSlimeShopItem(
  item: Pick<SlimeShopItem, "category">,
): boolean {
  return item.category === "vehicle" || item.category === "ride";
}

/** Complete legacy preview image, excluding every composable visual slot. */
export function slimeShopItemSpritePath(
  item: SlimeShopItem,
): string | undefined {
  if (
    item.category === "drink" ||
    item.category === "wearable" ||
    isVehicleSlimeShopItem(item) ||
    isSceneBackgroundItem(item) ||
    item.floor
  ) {
    return undefined;
  }
  if (item.key.startsWith("slime-ball-")) return undefined;
  return item.mobileSpritePath ?? item.spritePath;
}

/** Framework-neutral item preview composition shared by shop and wardrobe. */
export function slimeShopItemPreview(item: SlimeShopItem) {
  const wearables = resolveEquippedSlimeWearables([item.key], [item]);
  const vehicle = resolveEquippedVehicle([item.key], [item]);
  const trampoline = vehicle?.key === "slime-blue-trampoline";
  return {
    action: trampoline
      ? ("floor-interaction" as const)
      : item.category === "drink"
        ? ("drink" as const)
        : ("idle" as const),
    drinkFlavor: wearables.drink,
    propAction: resolveEquippedSlimePropAction([item.key], [item]),
    equippedFloor: trampoline
      ? ("trampoline" as const)
      : (item.floor ?? ("none" as const)),
    expandSceneSurfaces: trampoline,
    vehicle: trampoline ? null : vehicle,
    wearables,
  };
}

export function slimeShopItemBuffLabel(
  item: Pick<SlimeShopItem, "effectKey" | "effectBps">,
): string | null {
  if (!item.effectKey || !item.effectBps) return null;
  const label = EFFECT_CHIP_LABELS[item.effectKey] ?? item.effectKey;
  return `${label} +${item.effectBps / 100}%`;
}

export function slimeBuffChipTier(
  bps: number,
): "bronze" | "silver" | "gold" {
  if (bps > 200) return "gold";
  if (bps > 100) return "silver";
  return "bronze";
}

export function slimeWardrobeItemWearerLabel(
  itemKey: string,
  targetColor: SlimeColor,
  equippedItemsByColor: Partial<Record<SlimeColor, string[]>>,
  colorLabels: Readonly<Record<SlimeColor, string>>,
): string | null {
  for (const [color, itemKeys] of Object.entries(equippedItemsByColor) as [
    SlimeColor,
    string[] | undefined,
  ][]) {
    if (color === targetColor || !itemKeys?.includes(itemKey)) continue;
    return colorLabels[color] ?? color;
  }
  return null;
}

function equippedFloorForKeys(
  keys: readonly string[],
  catalogByKey: ReadonlyMap<string, SlimeShopItem>,
): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const key of keys) {
    const candidate = catalogByKey.get(key)?.floor;
    if (candidate) floor = candidate;
  }
  return floor;
}

/**
 * Apply the same one-item-per-visual-slot rule the server enforces.
 *
 * This is intentionally pure: the screen may show the optimistic result while
 * the request is queued, then replace it with the authoritative response or a
 * reload when the mutation fails.
 */
export function optimisticallyEquipSlimeItem(
  current: MobileSlimeHome,
  targetColor: SlimeColor,
  item: SlimeShopItem,
  isEquipped: boolean,
): MobileSlimeHome {
  const slot = slimeVisualItemSlot(item);
  if (!slot) return current;

  const catalogByKey = new Map(
    current.shopCatalog.map((candidate) => [candidate.key, candidate]),
  );
  const nextItemsByColor = { ...current.equippedItemsByColor };
  const nextHiddenByColor = { ...current.hiddenItemsByColor };

  for (const color of current.ownedColors) {
    let keys = [...(current.equippedItemsByColor[color] ?? [])];
    if (color === targetColor) {
      keys = keys.filter((key) => key !== item.key);
      if (isEquipped) {
        keys = keys.filter((key) => {
          const candidate = catalogByKey.get(key);
          return !candidate || slimeVisualItemSlot(candidate) !== slot;
        });
        keys.push(item.key);
      }
    } else if (isEquipped) {
      keys = keys.filter((key) => key !== item.key);
    }
    nextItemsByColor[color] = keys;
    const equipped = new Set(keys);
    nextHiddenByColor[color] = (
      current.hiddenItemsByColor[color] ?? []
    ).filter((key) => equipped.has(key));
  }

  const equippedItemKeys = Array.from(
    new Set(Object.values(nextItemsByColor).flatMap((keys) => keys ?? [])),
  );
  const hiddenItemKeys = Array.from(
    new Set(Object.values(nextHiddenByColor).flatMap((keys) => keys ?? [])),
  );
  const equippedFloorByColor = { ...current.equippedFloorByColor };
  for (const color of current.ownedColors) {
    equippedFloorByColor[color] = equippedFloorForKeys(
      nextItemsByColor[color] ?? [],
      catalogByKey,
    );
  }

  return {
    ...current,
    equippedItemKeys,
    equippedItemsByColor: nextItemsByColor,
    hiddenItemKeys,
    hiddenItemsByColor: nextHiddenByColor,
    equippedFloorByColor,
    equippedFloor: current.representativeColor
      ? (equippedFloorByColor[current.representativeColor] ?? "none")
      : "none",
  };
}

export type SlimeShopOverviewSection = Readonly<{
  key: Exclude<SlimeShopFilter, "all" | "level-up">;
  label: string;
  characters: readonly SlimeCatalogItem[];
  items: readonly SlimeShopItem[];
}>;

const OVERVIEW_LABELS: Readonly<
  Record<Exclude<SlimeShopFilter, "all" | "level-up">, string>
> = {
  character: "캐릭터",
  background: "배경",
  floor: "바닥",
  vehicle: "탈것",
  food: "먹이",
  prop: "소품",
  outfit: "착장",
};

/** Build the framework-neutral category hierarchy shared by compact shop UIs. */
export function buildSlimeShopOverviewSections(
  characters: readonly SlimeCatalogItem[],
  items: readonly SlimeShopItem[],
): readonly SlimeShopOverviewSection[] {
  const sections: SlimeShopOverviewSection[] = [
    {
      key: "character",
      label: OVERVIEW_LABELS.character,
      characters: [...characters].sort(
        (left, right) => (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0),
      ),
      items: [],
    },
  ];

  const keys: Array<Exclude<SlimeShopFilter, "all" | "character" | "level-up">> = [
    "background",
    "floor",
    "vehicle",
    "food",
    "prop",
    "outfit",
  ];
  for (const key of keys) {
    const sectionItems = items
      .filter((item) => shopFilterForItem(item) === key)
      .sort(
        (left, right) => (right.purchaseCount ?? 0) - (left.purchaseCount ?? 0),
      );
    if (sectionItems.length === 0) continue;
    sections.push({
      key,
      label: OVERVIEW_LABELS[key],
      characters: [],
      items: sectionItems,
    });
  }
  return sections;
}
