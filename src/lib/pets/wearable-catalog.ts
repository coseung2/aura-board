import {
  GROWTH_HEADWEAR_BY_STAGE,
  SLIME_EQUIPPABLE_ROLES,
  slimeWearableEntry,
  slimeWearableOptions,
  type SlimeEquippableRole,
} from "./slime-wearables";
import type { SlimeEffectKey } from "./types";

/**
 * Shop-facing wearables backed by imported anchor art.
 *
 * This is separate from `SLIME_ACCESSORY_CATALOG`, which describes the older
 * set-bonus accessories that have no sprites. Every option here is verified
 * against the generated registry, so a catalog entry can never point at art the
 * importer did not produce.
 */
export type SlimeWearableCatalogItem = Readonly<{
  key: string;
  role: SlimeEquippableRole;
  option: string;
  labelKo: string;
  price: number;
  tier: SlimeWearableTier;
  effectKey: SlimeEffectKey;
  effectBps: number;
}>;

const HEADWEAR_LABELS: Readonly<Record<string, string>> = {
  "beige-beanie": "베이지 비니",
  "brown-beanie": "브라운 비니",
  "caramel-puppy-ear-headband": "카라멜 강아지 귀 머리띠",
  "charcoal-beanie": "차콜 비니",
  "cream-bunny-ear-headband": "크림 토끼 귀 머리띠",
  "ivory-beanie": "아이보리 비니",
  "mauve-cat-ear-headband": "모브 고양이 귀 머리띠",
  "pearl-ribbon-headband": "진주 리본 머리띠",
  "purple-wizard-hat": "보라 마법사 모자",
  "red-baseball-cap": "빨강 야구 모자",
  "straw-hat": "밀짚모자",
};

const EYEWEAR_LABELS: Readonly<Record<string, string>> = {
  "black-goggles": "검정 고글",
  "black-sunglasses": "검정 선글라스",
  "copper-goggles": "구리 고글",
  "gold-goggles": "황금 고글",
  "red-sunglasses": "빨강 선글라스",
  "round-glasses": "동그란 안경",
  "silver-goggles": "은색 고글",
};

const BLUSH_LABELS: Readonly<Record<string, string>> = {
  "peach-brush-blush": "피치 브러시 볼터치",
  "rose-brush-blush": "로즈 브러시 볼터치",
};

const LABELS_BY_ROLE: Readonly<Record<SlimeEquippableRole, Readonly<Record<string, string>>>> = {
  blush: BLUSH_LABELS,
  headwear: HEADWEAR_LABELS,
  eyewear: EYEWEAR_LABELS,
};

/**
 * Price bands shared with the background and floor catalogs, so every shop
 * category reads on one scale.
 */
export const SLIME_WEARABLE_TIER_PRICE = { 1: 1_000, 2: 700, 3: 500 } as const;

/**
 * Buff strength per tier, matching the background and floor catalogs.
 */
export const SLIME_WEARABLE_TIER_BPS = { 1: 300, 2: 200, 3: 100 } as const;

export type SlimeWearableTier = keyof typeof SLIME_WEARABLE_TIER_PRICE;

/**
 * Each slot owns one reward stream, so a slime wearing all three slots earns
 * three distinct buffs rather than stacking one.
 */
const EFFECT_BY_ROLE: Readonly<Record<SlimeEquippableRole, SlimeEffectKey>> = {
  headwear: "assignment_reward",
  eyewear: "reading_reward",
  blush: "comment_reward",
};

/**
 * Tier per option. Anything not listed is entry tier.
 *
 * Kept explicit rather than derived from the option name so a rename cannot
 * silently change an item's price or buff.
 */
const TIER_BY_OPTION: Readonly<Record<string, SlimeWearableTier>> = {
  "caramel-puppy-ear-headband": 1,
  "cream-bunny-ear-headband": 2,
  "mauve-cat-ear-headband": 2,
  "pearl-ribbon-headband": 1,
  "purple-wizard-hat": 1,
};

function tierForOption(option: string): SlimeWearableTier {
  return TIER_BY_OPTION[option] ?? 3;
}

function buildCatalog(): readonly SlimeWearableCatalogItem[] {
  const items: SlimeWearableCatalogItem[] = [];
  for (const role of SLIME_EQUIPPABLE_ROLES) {
    for (const option of slimeWearableOptions(role)) {
      const labelKo = LABELS_BY_ROLE[role][option];
      if (!labelKo) {
        throw new Error(`Missing Korean label for wearable ${role}/${option}`);
      }
      items.push({
        key: `slime-${role}-${option}`,
        role,
        option,
        labelKo,
        tier: tierForOption(option),
        price: SLIME_WEARABLE_TIER_PRICE[tierForOption(option)],
        effectKey: EFFECT_BY_ROLE[role],
        effectBps: SLIME_WEARABLE_TIER_BPS[tierForOption(option)],
      });
    }
  }
  return items;
}

export const SLIME_WEARABLE_CATALOG = buildCatalog();

/**
 * Set bonuses for wearing a matching family.
 *
 * These are deliberately family-based rather than slot-based: collecting one
 * visual family is a longer goal than filling three slots, and the bonus is what
 * makes an entry-tier family worth completing. Bonuses use the same effect keys
 * as the individual pieces so the breakdown stays readable.
 *
 * Keys are option ids, which the builder below resolves to catalog keys, so a
 * typo fails at module load rather than silently disabling a set.
 */
const WEARABLE_SET_DEFINITIONS = [
  {
    key: "beanie-collection",
    labelKo: "비니 컬렉션",
    options: ["beige-beanie", "brown-beanie", "charcoal-beanie", "ivory-beanie"],
    effectKey: "assignment_reward",
    effectBps: 200,
  },
  {
    key: "goggles-collection",
    labelKo: "고글 컬렉션",
    options: ["black-goggles", "copper-goggles", "gold-goggles", "silver-goggles"],
    effectKey: "reading_reward",
    effectBps: 200,
  },
  {
    key: "sunglasses-pair",
    labelKo: "선글라스 세트",
    options: ["black-sunglasses", "red-sunglasses"],
    effectKey: "reading_reward",
    effectBps: 100,
  },
  {
    key: "blush-pair",
    labelKo: "볼터치 세트",
    options: ["peach-brush-blush", "rose-brush-blush"],
    effectKey: "comment_reward",
    effectBps: 100,
  },
] as const satisfies readonly {
  key: string;
  labelKo: string;
  options: readonly string[];
  effectKey: SlimeEffectKey;
  effectBps: number;
}[];

export type SlimeWearableSet = Readonly<{
  key: string;
  labelKo: string;
  /** Shop keys that must all be owned for the bonus to apply. */
  requiredItemKeys: readonly string[];
  effectKey: SlimeEffectKey;
  effectBps: number;
}>;

function buildSets(): readonly SlimeWearableSet[] {
  const byOption = new Map(SLIME_WEARABLE_CATALOG.map((item) => [item.option, item.key]));
  return WEARABLE_SET_DEFINITIONS.map((definition) => ({
    key: definition.key,
    labelKo: definition.labelKo,
    requiredItemKeys: definition.options.map((option) => {
      const key = byOption.get(option);
      if (!key) {
        throw new Error(`Wearable set ${definition.key} references unknown option ${option}`);
      }
      return key;
    }),
    effectKey: definition.effectKey,
    effectBps: definition.effectBps,
  }));
}

export const SLIME_WEARABLE_SET_CATALOG = buildSets();

/**
 * Set bonuses earned from the pieces currently worn across the collection.
 *
 * A slime wears one option per slot, so a family is completed by spreading it
 * over several pets: four beanies on four slimes activates the beanie collection.
 * Callers therefore pass every pet's equipped keys, not one pet's.
 *
 * Owning a piece grants nothing on its own, so the bonus rewards dressing the
 * collection rather than filling a wardrobe.
 */
export function activeSlimeWearableSets(
  equippedItemKeys: readonly string[],
): readonly SlimeWearableSet[] {
  const worn = new Set(equippedItemKeys);
  return SLIME_WEARABLE_SET_CATALOG.filter((set) =>
    set.requiredItemKeys.every((key) => worn.has(key)),
  );
}

/** Growth-awarded crowns are never purchasable, so they stay out of the shop. */
export const SLIME_GROWTH_HEADWEAR_OPTIONS = Object.values(GROWTH_HEADWEAR_BY_STAGE);

export function slimeWearableCatalogItem(key: string): SlimeWearableCatalogItem | null {
  return SLIME_WEARABLE_CATALOG.find((item) => item.key === key) ?? null;
}

export function slimeWearableCatalogForRole(
  role: SlimeEquippableRole,
): readonly SlimeWearableCatalogItem[] {
  return SLIME_WEARABLE_CATALOG.filter((item) => item.role === role);
}

/**
 * Reduce equipped wearable keys to at most one option per slot.
 *
 * Blush, headwear, and eyewear are single-slot: the growth crown and a chosen hat share
 * the head slot, so allowing two headwear options would make the winner depend
 * on array order. The last key wins, matching how equipping feels to a player.
 */
export function normalizeEquippedWearables(
  keys: readonly string[],
): Readonly<Partial<Record<SlimeEquippableRole, string>>> {
  const selection: Partial<Record<SlimeEquippableRole, string>> = {};
  for (const key of keys) {
    const item = slimeWearableCatalogItem(key);
    if (!item) continue;
    // Guard against a catalog entry whose art was removed from the registry.
    if (!slimeWearableEntry(item.role, item.option)) continue;
    selection[item.role] = item.option;
  }
  return selection;
}
