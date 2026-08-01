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
  "aqua-bomb-bandana": "물빛 별폭탄 두건",
  "beige-beanie": "베이지 비니",
  "black-swoosh-sport-headband": "블랙 윙 스포츠 헤드밴드",
  "brainrot-antenna-headband": "브레인롯 안테나 머리띠",
  "brown-beanie": "브라운 비니",
  "caramel-puppy-ear-headband": "카라멜 강아지 귀 머리띠",
  "charcoal-beanie": "차콜 비니",
  "cream-bunny-ear-headband": "크림 토끼 귀 머리띠",
  "crimson-pirate-bandana": "진홍빛 해적 두건",
  "detective-deerstalker": "명탐정 디어스토커",
  "flame-tail-bandana": "불꽃 꼬리 두건",
  "forest-camo-bandana": "숲그늘 위장 두건",
  "golden-aura-halo": "황금 오라 후광",
  "ivory-beanie": "아이보리 비니",
  "lilac-origami-crane-fascinator": "라일락 종이학 패시네이터",
  "lime-barracuda-headset": "라임 게이밍 헤드셋",
  "mauve-cat-ear-headband": "모브 고양이 귀 머리띠",
  "midnight-street-bandana": "한밤의 거리 두건",
  "neon-circuit-headband": "네온 서킷 헤드밴드",
  "olive-ribbed-beanie": "올리브 골지 비니",
  "orange-67-headband": "오렌지 67 배지 헤드밴드",
  "orange-dj-headset": "오렌지 DJ 헤드폰",
  "pearl-ribbon-headband": "진주 리본 머리띠",
  "pirate-tricorn-hat": "해적 트라이콘 모자",
  "purple-cat-ear-headset": "퍼플 캣이어 헤드셋",
  "purple-wizard-hat": "보라 마법사 모자",
  "ramen-cup-novelty-hat": "엉뚱 라면컵 모자",
  "red-snapback-cap": "레드 스냅백 캡",
  "red-baseball-cap": "빨강 야구 모자",
  "retro-cassette-headset": "레트로 카세트 헤드폰",
  "retro-terry-headband": "레트로 테리클로스 헤드밴드",
  "shadow-thief-bandana": "그림자 도적 두건",
  "silver-studio-headset": "실버 스튜디오 헤드폰",
  "sprout-terrarium-dome-hat": "새싹 테라리움 돔 모자",
  "starry-wizard-hat": "별빛 마법사 모자",
  "straw-hat": "밀짚모자",
  "violet-aura-flame-headband": "바이올렛 오라 플레임 헤드밴드",
  "violet-bucket-hat": "보랏빛 버킷햇",
  "white-spatial-headset": "화이트 공간음향 헤드폰",
  "white-triple-stripe-headband": "화이트 삼선 스포츠 헤드밴드",
};

const EYEWEAR_LABELS: Readonly<Record<string, string>> = {
  "black-goggles": "검정 고글",
  "black-sunglasses": "검정 선글라스",
  "blue-cyber-visor": "블루 사이버 바이저",
  "copper-goggles": "구리 고글",
  "crescent-moon-half-rim-glasses": "초승달 하프림 안경",
  "cyber-monocle": "사이버 모노클",
  "gold-goggles": "황금 고글",
  "gold-star-glasses": "골드 스타 안경",
  "neon-ski-goggles": "네온 스키 고글",
  "pixel-deal-with-it-shades": "픽셀 쿨가이 선글라스",
  "prism-kaleidoscope-glasses": "프리즘 만화경 안경",
  "red-sunglasses": "빨강 선글라스",
  "red-wraparound-sport-shades": "레드 랩어라운드 스포츠 선글라스",
  "round-glasses": "동그란 안경",
  "round-study-glasses": "둥근 모범생 안경",
  "ruby-heart-glasses": "루비 하트 안경",
  "sigma-angular-shades": "시그마 앵글 선글라스",
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
  "aqua-bomb-bandana": 2,
  "black-swoosh-sport-headband": 2,
  "blue-cyber-visor": 1,
  "brainrot-antenna-headband": 2,
  "caramel-puppy-ear-headband": 1,
  "cream-bunny-ear-headband": 2,
  "crimson-pirate-bandana": 2,
  "cyber-monocle": 1,
  "detective-deerstalker": 2,
  "flame-tail-bandana": 1,
  "gold-star-glasses": 1,
  "golden-aura-halo": 1,
  "lime-barracuda-headset": 1,
  "lilac-origami-crane-fascinator": 2,
  "mauve-cat-ear-headband": 2,
  "midnight-street-bandana": 2,
  "neon-circuit-headband": 1,
  "neon-ski-goggles": 1,
  "orange-67-headband": 2,
  "orange-dj-headset": 2,
  "pearl-ribbon-headband": 1,
  "pirate-tricorn-hat": 1,
  "pixel-deal-with-it-shades": 2,
  "prism-kaleidoscope-glasses": 1,
  "purple-cat-ear-headset": 1,
  "purple-wizard-hat": 1,
  "ramen-cup-novelty-hat": 2,
  "red-wraparound-sport-shades": 2,
  "ruby-heart-glasses": 2,
  "shadow-thief-bandana": 1,
  "sigma-angular-shades": 2,
  "silver-studio-headset": 2,
  "sprout-terrarium-dome-hat": 1,
  "starry-wizard-hat": 1,
  "violet-aura-flame-headband": 1,
  "white-spatial-headset": 1,
  "white-triple-stripe-headband": 2,
  "crescent-moon-half-rim-glasses": 2,
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
