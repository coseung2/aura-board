export * from "./catalog-core";
export * from "./catalog-shop";

import type { SlimeAccessoryDefinition, SlimeBallShopItem, SlimeBallSlug, SlimeColor, SlimeDefinition, SlimeFloor, SlimeSetDefinition, SlimeShopItem } from "./types";
import { SLIME_CATALOG, SLIME_BALL_CATALOG } from "./catalog-core";
import { SLIME_SHOP_CATALOG } from "./catalog-shop";

export const SLIME_ACCESSORY_CATALOG: readonly SlimeAccessoryDefinition[] = [
  { key: "aqua-ribbon", labelKo: "물방울 리본", setKey: "aqua", slot: "neck" },
  { key: "aqua-crown", labelKo: "파도 왕관", setKey: "aqua", slot: "head" },
  { key: "aqua-shell", labelKo: "조개 장식", setKey: "aqua", slot: "hand" },
  { key: "garden-leaf", labelKo: "새싹 잎사귀", setKey: "garden", slot: "head" },
  { key: "garden-vine", labelKo: "덩굴 팔찌", setKey: "garden", slot: "hand" },
  { key: "sunny-badge", labelKo: "햇살 배지", setKey: "sunny", slot: "neck" },
  { key: "sunny-cap", labelKo: "노랑 모자", setKey: "sunny", slot: "head" },
  { key: "starlit-brooch", labelKo: "별빛 브로치", setKey: "starlit", slot: "neck" },
  { key: "starlit-wand", labelKo: "별빛 스틱", setKey: "starlit", slot: "hand" },
] as const;

export const SLIME_SET_CATALOG: readonly SlimeSetDefinition[] = [
  {
    key: "aqua",
    labelKo: "아쿠아 세트",
    requiredAccessoryKeys: ["aqua-ribbon", "aqua-crown", "aqua-shell"],
    effectKey: "growth_speed",
    effectBps: 180,
  },
  {
    key: "garden",
    labelKo: "가든 세트",
    requiredAccessoryKeys: ["garden-leaf", "garden-vine"],
    effectKey: "reading_reward",
    effectBps: 160,
  },
  {
    key: "sunny",
    labelKo: "써니 세트",
    requiredAccessoryKeys: ["sunny-badge", "sunny-cap"],
    effectKey: "walking_reward",
    effectBps: 140,
  },
  {
    key: "starlit",
    labelKo: "스타라이트 세트",
    requiredAccessoryKeys: ["starlit-brooch", "starlit-wand"],
    effectKey: "assignment_reward",
    effectBps: 120,
  },
] as const;

const slimeByKey = new Map<SlimeColor, SlimeDefinition>(
  SLIME_CATALOG.map((slime) => [slime.key, slime]),
);
const accessoryByKey = new Map<string, SlimeAccessoryDefinition>(
  SLIME_ACCESSORY_CATALOG.map((accessory) => [accessory.key, accessory]),
);
const slimeShopItemByKey = new Map<string, SlimeShopItem>(
  SLIME_SHOP_CATALOG.map((item) => [item.key, item]),
);
const slimeBallBySlug = new Map<SlimeBallSlug, SlimeBallShopItem>(
  SLIME_BALL_CATALOG.map((item) => [item.slug, item]),
);

export function getSlimeDefinition(key: string): SlimeDefinition | undefined {
  return slimeByKey.get(key as SlimeColor);
}

export function getSlimeAccessoryDefinition(
  key: string,
): SlimeAccessoryDefinition | undefined {
  return accessoryByKey.get(key);
}

export function getSlimeShopItem(key: string): SlimeShopItem | undefined {
  return slimeShopItemByKey.get(key);
}

export type SlimeVisualItemSlot =
  | "background"
  | "floor"
  | "vehicle"
  | "prop"
  | "blush"
  | "eyewear"
  | "headwear";

/** A scene background has no floor state; legacy background floors still do. */
export function isSlimeSceneBackground(
  item: Pick<SlimeShopItem, "category" | "floor">,
): boolean {
  return item.category === "background" && item.floor === null;
}

/**
 * Prefer the sharper mobile/web display sheet (usually 128px) for scene art.
 * Falls back to the catalog preview path when a dedicated sheet is absent.
 */
export function selectSceneBackgroundSpritePath(
  item: Pick<SlimeShopItem, "mobileSpritePath" | "spritePath">,
): string {
  return item.mobileSpritePath || item.spritePath;
}

/** Scene backgrounds, floors, and accessories occupy independent visual slots. */
export function slimeVisualItemSlot(
  item: Pick<SlimeShopItem, "category" | "floor" | "wearableRole">,
): SlimeVisualItemSlot | null {
  if (item.floor) return "floor";
  if (isSlimeSceneBackground(item)) return "background";
  // Vehicles sit above the floor instead of replacing it, so they own their own
  // slot and stay equippable alongside a background and a floor.
  if (item.category === "vehicle" || item.category === "ride") return "vehicle";
  if (item.category === "drink" || item.category === "prop") return "prop";
  if (item.category === "wearable") return item.wearableRole ?? null;
  return null;
}

/** Collapse malformed legacy arrays to one key per visual slot. Last key wins. */
export function normalizeEquippedSlimeItemKeys(itemKeys: readonly string[]): string[] {
  const slotKeys: Partial<Record<SlimeVisualItemSlot, string>> = {};
  for (const itemKey of itemKeys) {
    const item = getSlimeShopItem(itemKey);
    if (!item) continue;
    const slot = slimeVisualItemSlot(item);
    if (slot) slotKeys[slot] = item.key;
  }
  return ["background", "floor", "vehicle", "prop", "blush", "eyewear", "headwear"]
    .map((slot) => slotKeys[slot as SlimeVisualItemSlot])
    .filter((key): key is string => Boolean(key));
}

export function getSlimeBallDefinition(slug: string): SlimeBallShopItem | undefined {
  return slimeBallBySlug.get(slug as SlimeBallSlug);
}

/** Legacy rows may contain several floors; the last equipped key wins. */
export function getEquippedSlimeFloor(itemKeys: readonly string[]): SlimeFloor {
  let floor: SlimeFloor = "none";
  for (const itemKey of itemKeys) {
    const candidate = getSlimeShopItem(itemKey)?.floor;
    if (candidate) floor = candidate;
  }
  return floor;
}
