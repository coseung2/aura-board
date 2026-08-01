import { describe, expect, it } from "vitest";

import { slimeWearableEntry, slimeWearableOptions } from "./slime-wearables";
import {
  SLIME_GROWTH_HEADWEAR_OPTIONS,
  SLIME_WEARABLE_CATALOG,
  SLIME_WEARABLE_SET_CATALOG,
  SLIME_WEARABLE_TIER_BPS,
  SLIME_WEARABLE_TIER_PRICE,
  activeSlimeWearableSets,
  normalizeEquippedWearables,
  slimeWearableCatalogForRole,
} from "./wearable-catalog";

describe("slime wearable buffs", () => {
  it("prices on the same bands as backgrounds and floors", () => {
    expect(SLIME_WEARABLE_TIER_PRICE).toEqual({ 1: 1_000, 2: 700, 3: 500 });
    for (const item of SLIME_WEARABLE_CATALOG) {
      expect(item.price, item.key).toBe(SLIME_WEARABLE_TIER_PRICE[item.tier]);
    }
  });

  it("scales buff strength with tier", () => {
    for (const item of SLIME_WEARABLE_CATALOG) {
      expect(item.effectBps, item.key).toBe(SLIME_WEARABLE_TIER_BPS[item.tier]);
      expect(item.effectBps).toBeGreaterThan(0);
    }
  });

  it("applies the authored premium and refined tiers", () => {
    const premium = SLIME_WEARABLE_CATALOG.filter((item) => item.tier === 1);
    expect(premium.map((item) => item.option).sort()).toEqual([
      "blue-cyber-visor",
      "caramel-puppy-ear-headband",
      "cyber-monocle",
      "flame-tail-bandana",
      "gold-star-glasses",
      "golden-aura-halo",
      "lime-barracuda-headset",
      "neon-circuit-headband",
      "neon-ski-goggles",
      "pearl-ribbon-headband",
      "pirate-tricorn-hat",
      "prism-kaleidoscope-glasses",
      "purple-cat-ear-headset",
      "purple-wizard-hat",
      "shadow-thief-bandana",
      "sprout-terrarium-dome-hat",
      "starry-wizard-hat",
      "violet-aura-flame-headband",
      "white-spatial-headset",
    ]);
    const refined = SLIME_WEARABLE_CATALOG.filter((item) => item.tier === 2);
    expect(refined.map((item) => item.option).sort()).toEqual([
      "aqua-bomb-bandana",
      "black-swoosh-sport-headband",
      "brainrot-antenna-headband",
      "cream-bunny-ear-headband",
      "crescent-moon-half-rim-glasses",
      "crimson-pirate-bandana",
      "detective-deerstalker",
      "lilac-origami-crane-fascinator",
      "mauve-cat-ear-headband",
      "midnight-street-bandana",
      "orange-67-headband",
      "orange-dj-headset",
      "pixel-deal-with-it-shades",
      "ramen-cup-novelty-hat",
      "red-wraparound-sport-shades",
      "ruby-heart-glasses",
      "sigma-angular-shades",
      "silver-studio-headset",
      "white-triple-stripe-headband",
    ]);
  });

  it("gives each slot its own reward stream", () => {
    const effectByRole = new Map<string, Set<string>>();
    for (const item of SLIME_WEARABLE_CATALOG) {
      const seen = effectByRole.get(item.role) ?? new Set();
      seen.add(item.effectKey);
      effectByRole.set(item.role, seen);
    }
    // One effect per slot, and no two slots share an effect, so wearing all three
    // earns three distinct buffs.
    const effects: string[] = [];
    for (const [, seen] of effectByRole) {
      expect(seen.size).toBe(1);
      effects.push([...seen][0]);
    }
    expect(new Set(effects).size).toBe(effects.length);
  });
});

describe("slime wearable sets", () => {
  it("references only real catalog items", () => {
    const keys = new Set(SLIME_WEARABLE_CATALOG.map((item) => item.key));
    for (const set of SLIME_WEARABLE_SET_CATALOG) {
      expect(set.requiredItemKeys.length).toBeGreaterThan(1);
      for (const key of set.requiredItemKeys) {
        expect(keys.has(key), `${set.key} -> ${key}`).toBe(true);
      }
      expect(set.effectBps).toBeGreaterThan(0);
    }
  });

  it("activates only when every piece of a family is owned", () => {
    const set = SLIME_WEARABLE_SET_CATALOG.find((item) => item.key === "blush-pair");
    expect(set).toBeTruthy();

    const partial = set.requiredItemKeys.slice(0, 1);
    expect(activeSlimeWearableSets(partial)).toEqual([]);
    expect(activeSlimeWearableSets(set.requiredItemKeys).map((item) => item.key)).toContain(
      "blush-pair",
    );
  });

  it("activates nothing for an empty inventory", () => {
    expect(activeSlimeWearableSets([])).toEqual([]);
  });
});

describe("slime wearable shop catalog", () => {
  it("registers every headband with its approved label and tier", () => {
    expect(
      slimeWearableCatalogForRole("headwear")
        .filter((item) => item.option.includes("headband"))
        .map(({ option, labelKo, tier, price, effectBps }) => ({ option, labelKo, tier, price, effectBps }))
        .sort((a, b) => a.option.localeCompare(b.option)),
    ).toEqual([
      { option: "black-swoosh-sport-headband", labelKo: "블랙 윙 스포츠 헤드밴드", tier: 2, price: 700, effectBps: 200 },
      { option: "brainrot-antenna-headband", labelKo: "브레인롯 안테나 머리띠", tier: 2, price: 700, effectBps: 200 },
      { option: "caramel-puppy-ear-headband", labelKo: "카라멜 강아지 귀 머리띠", tier: 1, price: 1_000, effectBps: 300 },
      { option: "cream-bunny-ear-headband", labelKo: "크림 토끼 귀 머리띠", tier: 2, price: 700, effectBps: 200 },
      { option: "mauve-cat-ear-headband", labelKo: "모브 고양이 귀 머리띠", tier: 2, price: 700, effectBps: 200 },
      { option: "neon-circuit-headband", labelKo: "네온 서킷 헤드밴드", tier: 1, price: 1_000, effectBps: 300 },
      { option: "orange-67-headband", labelKo: "오렌지 67 배지 헤드밴드", tier: 2, price: 700, effectBps: 200 },
      { option: "pearl-ribbon-headband", labelKo: "진주 리본 머리띠", tier: 1, price: 1_000, effectBps: 300 },
      { option: "retro-terry-headband", labelKo: "레트로 테리클로스 헤드밴드", tier: 3, price: 500, effectBps: 100 },
      { option: "violet-aura-flame-headband", labelKo: "바이올렛 오라 플레임 헤드밴드", tier: 1, price: 1_000, effectBps: 300 },
      { option: "white-triple-stripe-headband", labelKo: "화이트 삼선 스포츠 헤드밴드", tier: 2, price: 700, effectBps: 200 },
    ]);
  });

  it("offers exactly the imported purchasable options", () => {
    expect(slimeWearableCatalogForRole("blush")).toHaveLength(2);
    expect(slimeWearableCatalogForRole("headwear")).toHaveLength(40);
    expect(slimeWearableCatalogForRole("eyewear")).toHaveLength(18);
    for (const item of SLIME_WEARABLE_CATALOG) {
      expect(slimeWearableEntry(item.role, item.option), item.key).toBeTruthy();
      expect(item.labelKo.length).toBeGreaterThan(0);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it("registers the four batch-v2 delivery options with approved shop contracts", () => {
    expect(
      [
        "slime-headwear-lilac-origami-crane-fascinator",
        "slime-headwear-sprout-terrarium-dome-hat",
        "slime-eyewear-prism-kaleidoscope-glasses",
        "slime-eyewear-crescent-moon-half-rim-glasses",
      ].map((key) => SLIME_WEARABLE_CATALOG.find((item) => item.key === key)),
    ).toEqual([
      expect.objectContaining({ labelKo: "라일락 종이학 패시네이터", tier: 2, price: 700, effectKey: "assignment_reward", effectBps: 200 }),
      expect.objectContaining({ labelKo: "새싹 테라리움 돔 모자", tier: 1, price: 1_000, effectKey: "assignment_reward", effectBps: 300 }),
      expect.objectContaining({ labelKo: "프리즘 만화경 안경", tier: 1, price: 1_000, effectKey: "reading_reward", effectBps: 300 }),
      expect.objectContaining({ labelKo: "초승달 하프림 안경", tier: 2, price: 700, effectKey: "reading_reward", effectBps: 200 }),
    ]);
    expect(SLIME_WEARABLE_CATALOG.some((item) => item.option === "acorn-leaf-beret")).toBe(false);
  });

  it("never sells a growth-awarded crown", () => {
    for (const option of SLIME_GROWTH_HEADWEAR_OPTIONS) {
      // The art exists, but it is awarded by growth stage rather than bought.
      expect(slimeWearableEntry("headwear", option), option).toBeTruthy();
      expect(slimeWearableOptions("headwear")).not.toContain(option);
      expect(SLIME_WEARABLE_CATALOG.some((item) => item.option === option)).toBe(false);
    }
  });

  it("keeps one option per slot so the head slot has a single winner", () => {
    const selection = normalizeEquippedWearables([
      "slime-headwear-straw-hat",
      "slime-headwear-red-baseball-cap",
      "slime-eyewear-round-glasses",
      "slime-blush-peach-brush-blush",
    ]);
    expect(selection).toEqual({
      blush: "peach-brush-blush",
      headwear: "red-baseball-cap",
      eyewear: "round-glasses",
    });
  });

  it("ignores unknown keys and keys whose art is absent", () => {
    expect(normalizeEquippedWearables(["nope", "slime-headwear-not-real"])).toEqual({});
  });

  it("cannot be used to equip a growth crown through the shop key format", () => {
    expect(normalizeEquippedWearables(["slime-headwear-gold-crown-red-gem"])).toEqual({});
  });
});
