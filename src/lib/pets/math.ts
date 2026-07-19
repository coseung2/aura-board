import {
  SLIME_ACCESSORY_CATALOG,
  SLIME_CATALOG,
  SLIME_SET_CATALOG,
  getSlimeDefinition,
} from "./catalog";
import type {
  SlimeAccessoryDefinition,
  SlimeBuffBreakdownItem,
  SlimeDefinition,
  SlimeEffectKey,
  SlimeEffectsPayload,
} from "./types";
import { SLIME_EFFECT_KEYS } from "./types";

/** A per-effect guardrail for this preview contract. Values are basis points. */
export const SLIME_EFFECT_CAP_BPS = 2_000;

export type SlimeBuffInput = Pick<
  SlimeDefinition,
  "key" | "nameKo" | "effectKey" | "baseBuffBps"
>;

export type SlimeAccessoryInput = Pick<
  SlimeAccessoryDefinition,
  "key" | "labelKo" | "setKey"
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
): SlimeEffectsPayload {
  const uncappedTotals = emptyTotals();
  const breakdown: SlimeBuffBreakdownItem[] = [];
  const safeCap = Math.max(0, safeBps(capBps));

  for (const slime of slimes) {
    if (!SLIME_EFFECT_KEYS.includes(slime.effectKey)) continue;
    const bps = safeBps(slime.baseBuffBps);
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
  accessoryKeys: readonly string[] = [],
  capBps = SLIME_EFFECT_CAP_BPS,
): SlimeEffectsPayload {
  const slimes = slimeKeys
    .map((key) => getSlimeDefinition(key))
    .filter((slime): slime is SlimeDefinition => Boolean(slime));
  const accessories = accessoryKeys
    .map((key) => SLIME_ACCESSORY_CATALOG.find((item) => item.key === key))
    .filter((item): item is SlimeAccessoryDefinition => Boolean(item));
  return calculateSlimeEffects(slimes, accessories, capBps);
}
