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
      "caramel-puppy-ear-headband",
      "pearl-ribbon-headband",
      "purple-wizard-hat",
    ]);
    const refined = SLIME_WEARABLE_CATALOG.filter((item) => item.tier === 2);
    expect(refined.map((item) => item.option).sort()).toEqual([
      "cream-bunny-ear-headband",
      "mauve-cat-ear-headband",
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
  it("registers the four new headbands with their approved labels and tiers", () => {
    expect(
      slimeWearableCatalogForRole("headwear")
        .filter((item) => item.option.includes("headband"))
        .map(({ option, labelKo, tier, price, effectBps }) => ({ option, labelKo, tier, price, effectBps }))
        .sort((a, b) => a.option.localeCompare(b.option)),
    ).toEqual([
      { option: "caramel-puppy-ear-headband", labelKo: "카라멜 강아지 귀 머리띠", tier: 1, price: 1_000, effectBps: 300 },
      { option: "cream-bunny-ear-headband", labelKo: "크림 토끼 귀 머리띠", tier: 2, price: 700, effectBps: 200 },
      { option: "mauve-cat-ear-headband", labelKo: "모브 고양이 귀 머리띠", tier: 2, price: 700, effectBps: 200 },
      { option: "pearl-ribbon-headband", labelKo: "진주 리본 머리띠", tier: 1, price: 1_000, effectBps: 300 },
    ]);
  });

  it("offers exactly the imported purchasable options", () => {
    expect(slimeWearableCatalogForRole("blush")).toHaveLength(2);
    expect(slimeWearableCatalogForRole("headwear")).toHaveLength(11);
    expect(slimeWearableCatalogForRole("eyewear")).toHaveLength(7);
    for (const item of SLIME_WEARABLE_CATALOG) {
      expect(slimeWearableEntry(item.role, item.option), item.key).toBeTruthy();
      expect(item.labelKo.length).toBeGreaterThan(0);
      expect(item.price).toBeGreaterThan(0);
    }
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
