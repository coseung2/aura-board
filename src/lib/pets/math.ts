import {
  SLIME_ACCESSORY_CATALOG,
  SLIME_CATALOG,
  SLIME_SET_CATALOG,
  getSlimeDefinition,
  getSlimeShopItem,
  isSlimeSceneBackground,
} from "./catalog";
import { activeSlimeWearableSets } from "./wearable-catalog";
import type {
  SlimeAccessoryDefinition,
  SlimeBuffBreakdownItem,
  SlimeDefinition,
  SlimeEffectKey,
  SlimeEffectsPayload,
  SlimeColor,
  SlimeShopItem,
} from "./types";
import { SLIME_EFFECT_KEYS } from "./types";

/**
 * Effects are uncapped. The value stays as an explicit "no ceiling" default so
 * existing callers that pass a cap keep working while nothing is clamped.
 */
export const SLIME_EFFECT_CAP_BPS = Number.MAX_SAFE_INTEGER;

export type SlimeBuffInput = Pick<
  SlimeDefinition,
  "key" | "nameKo" | "effectKey" | "baseBuffBps"
> & { growthStage?: number };

export type SlimeAccessoryInput = Pick<
  SlimeAccessoryDefinition,
  "key" | "labelKo" | "setKey"
>;

export type SlimeShopEffectInput = Pick<
  SlimeShopItem,
  "key" | "category" | "floor" | "labelKo" | "effectKey" | "effectBps"
>;

function emptyTotals(): Record<SlimeEffectKey, number> {
  return Object.fromEntries(SLIME_EFFECT_KEYS.map((key) => [key, 0])) as Record<
    SlimeEffectKey,
    number
  >;
}

function safeBps(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Stage one uses the catalog base; stages two and three double it successively. */
export function slimeBuffBpsForStage(baseBuffBps: number, stage?: number): number {
  const base = safeBps(baseBuffBps);
  return stage !== undefined && stage >= 3 ? base * 4 : stage !== undefined && stage >= 2 ? base * 2 : base;
}

/** Format integer basis points as a compact percentage for user-facing copy. */
export function formatBpsPercent(bps: number): string {
  const percent = safeBps(bps) / 100;
  return `${percent.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

/**
 * Add individual slime buffs and complete accessory-set buffs, then cap each
 * effect before calculating the display total. Persistence remains outside
 * this pure function.
 */
export function calculateSlimeEffects(
  slimes: readonly SlimeBuffInput[],
  accessories: readonly SlimeAccessoryInput[] = [],
  capBps = SLIME_EFFECT_CAP_BPS,
  shopItems: readonly SlimeShopEffectInput[] = [],
  /**
   * Every equipped key across the collection, used for family set completion.
   *
   * Separate from `shopItems` because that list is filtered to items carrying a
   * buff, while set completion depends on the pieces actually worn.
   */
  equippedItemKeys: readonly string[] = shopItems.map((item) => item.key),
): SlimeEffectsPayload {
  const uncappedTotals = emptyTotals();
  const breakdown: SlimeBuffBreakdownItem[] = [];
  const safeCap = Math.max(0, safeBps(capBps));

  for (const slime of slimes) {
    if (!SLIME_EFFECT_KEYS.includes(slime.effectKey)) continue;
    const bps = slimeBuffBpsForStage(slime.baseBuffBps, slime.growthStage);
    if (bps === 0) continue;
    uncappedTotals[slime.effectKey] += bps;
    breakdown.push({
      source: "slime",
      key: slime.key,
      label: slime.nameKo,
      effectKey: slime.effectKey,
      bps,
    });
  }

  const accessoryKeys = new Set(accessories.map((accessory) => accessory.key));
  const activeSetKeys: string[] = [];
  for (const set of SLIME_SET_CATALOG) {
    const complete = set.requiredAccessoryKeys.every((key) =>
      accessoryKeys.has(key),
    );
    if (!complete) continue;
    const bps = safeBps(set.effectBps);
    if (bps === 0) continue;
    activeSetKeys.push(set.key);
    uncappedTotals[set.effectKey] += bps;
    breakdown.push({
      source: "set",
      key: set.key,
      label: `${set.labelKo} 효과`,
      effectKey: set.effectKey,
      bps,
    });
  }

  for (const item of shopItems) {
    if (
      !item.effectKey ||
      !SLIME_EFFECT_KEYS.includes(item.effectKey)
    ) continue;
    const bps = safeBps(item.effectBps ?? 0);
    if (bps === 0) continue;
    uncappedTotals[item.effectKey] += bps;
    breakdown.push({
      source: isSlimeSceneBackground(item) ? "background" : "item",
      key: item.key,
      label: item.labelKo,
      effectKey: item.effectKey,
      bps,
    });
  }

  // A slime wears one option per slot, so a family is completed by spreading it
  // over several pets: four beanies on four slimes activates the beanie set.
  // Completion therefore reads every equipped key, not just the buff-carrying ones.
  for (const set of activeSlimeWearableSets(equippedItemKeys)) {
    const bps = safeBps(set.effectBps);
    if (bps === 0) continue;
    activeSetKeys.push(set.key);
    uncappedTotals[set.effectKey] += bps;
    breakdown.push({
      source: "set",
      key: set.key,
      label: `${set.labelKo} 효과`,
      effectKey: set.effectKey,
      bps,
    });
  }

  const totals = emptyTotals();
  for (const key of SLIME_EFFECT_KEYS) {
    totals[key] = Math.min(safeCap, uncappedTotals[key]);
  }

  return {
    capBps: safeCap,
    totals,
    uncappedTotals,
    totalBps: Object.values(totals).reduce((sum, value) => sum + value, 0),
    activeSetKeys,
    breakdown,
  };
}

/** Resolve catalog keys for client and server effect summaries. */
export function calculateCatalogSlimeEffects(
  slimeKeys: readonly string[],
  equippedItemKeys: readonly string[] = [],
  capBps = SLIME_EFFECT_CAP_BPS,
  growthStages: Partial<Record<SlimeColor, number>> = {},
): SlimeEffectsPayload {
  const slimes = slimeKeys
    .map((key) => getSlimeDefinition(key))
    .filter((slime): slime is SlimeDefinition => Boolean(slime))
    .map((slime) => ({ ...slime, growthStage: growthStages[slime.color] }));
  const distinctItemKeys = [...new Set(equippedItemKeys)];
  const accessories = distinctItemKeys
    .map((key) => SLIME_ACCESSORY_CATALOG.find((item) => item.key === key))
    .filter((item): item is SlimeAccessoryDefinition => Boolean(item));
  const shopItems = distinctItemKeys
    .map((key) => getSlimeShopItem(key))
    .filter((item): item is SlimeShopItem => Boolean(item))
    .filter((item) => item.effectKey !== undefined && item.effectBps !== undefined);
  return calculateSlimeEffects(slimes, accessories, capBps, shopItems, distinctItemKeys);
}
