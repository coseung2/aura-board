import { describe, expect, it } from "vitest";
import {
  CREATURE_AFFINITIES,
  CREATURE_BEHAVIOR_KINDS,
  CREATURE_CATALOG_REVISION,
  CREATURE_CATALOG_VALIDATION,
  CREATURE_LINES,
  CREATURE_RANDOM_EGG_WEIGHTS,
  CREATURE_SHOP_PRODUCTS,
  CREATURE_STAGES,
  buildEffectiveRandomEggPool,
  buildAffinityEggPool,
  chooseWeightedCreatureLine,
  chooseWeightedCreatureLineKey,
  getCreatureAssetBehaviorLookup,
  getCreatureLine,
  getCreatureShopProduct,
  getCreatureStageForProgress,
  getCreatureStageDefinition,
  getCreatureStageProgressThreshold,
  getNextCreatureStage,
  listCreatureShopProducts,
  validateCreatureCatalog,
} from "./catalog";
import type { CreatureLineDefinition } from "./catalog";

describe("Aura creature catalog", () => {
  it("defines seven original lines with all four stages and three behaviors", () => {
    expect(CREATURE_LINES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(CREATURE_LINES.map((line) => line.key)).size).toBe(CREATURE_LINES.length);
    for (const affinity of CREATURE_AFFINITIES) {
      expect(CREATURE_LINES.some((line) => line.affinity === affinity)).toBe(true);
    }

    for (const line of CREATURE_LINES) {
      expect(line.affinityEggWeight).toBeGreaterThan(0);
      expect(line.stages).toHaveLength(4);
      expect(line.stages.map((stage) => stage.stage)).toEqual([...CREATURE_STAGES]);
      for (const stage of line.stages) {
        expect(stage.behaviors).toHaveLength(3);
        expect(stage.behaviors.map((behavior) => behavior.kind)).toEqual([...CREATURE_BEHAVIOR_KINDS]);
        expect(new Set(stage.behaviors.map((behavior) => behavior.actionId)).size).toBe(3);
      }
    }
  });

  it("keeps stable stage package and behavior sheet references", () => {
    for (const line of CREATURE_LINES) {
      for (const stage of line.stages) {
        expect(stage.packageId).toBe(`character.aura.${line.key}.${stage.stage}`);
        expect(stage.behaviorSheetId).toBe(`behavior.aura.${line.key}.${stage.stage}.v1`);
        expect(stage.behaviorSheetPath).toBe(`/creatures/${line.key}/${stage.stage}/sheet.json`);
        expect(getCreatureStageDefinition(line.key, stage.stage)).toBe(stage);
      }
    }

    const lookup = getCreatureAssetBehaviorLookup("dawnlet", "evolved", "signature");
    expect(lookup).toMatchObject({
      lineKey: "dawnlet",
      affinity: "light",
      stage: "evolved",
      kind: "signature",
      packageId: "character.aura.dawnlet.evolved",
      behaviorSheetId: "behavior.aura.dawnlet.evolved.v1",
      behaviorSheetPath: "/creatures/dawnlet/evolved/sheet.json",
    });
  });

  it("exposes pure key and product lookups", () => {
    expect(getCreatureLine("terramote")?.nameKo).toBe("테라모트");
    expect(getCreatureLine("missing")).toBeUndefined();
    expect(getCreatureShopProduct("egg-random-01")?.kind).toBe("random-egg");
    expect(getCreatureShopProduct("missing")).toBeUndefined();
    expect(listCreatureShopProducts("food")).toHaveLength(3);
    expect(listCreatureShopProducts()).toHaveLength(CREATURE_SHOP_PRODUCTS.length);
  });

  it("keeps the random egg price between basic and premium affinity tiers", () => {
    const random = listCreatureShopProducts("random-egg");
    expect(random).toHaveLength(1);
    const randomPrice = random[0]!.price;
    expect(randomPrice).toBe(150);

    const eggs = listCreatureShopProducts("affinity-egg");
    const priceFor = (affinity: string): number => {
      const product = eggs.find(
        (candidate) => candidate.effect.type === "affinity-egg" && candidate.effect.affinity === affinity,
      );
      if (!product) throw new Error(`Missing egg for ${affinity}`);
      return product.price;
    };
    expect(priceFor("earth")).toBe(100);
    expect(priceFor("river")).toBe(110);
    expect(priceFor("sea")).toBe(120);
    expect(Math.max(priceFor("earth"), priceFor("river"), priceFor("sea"))).toBeLessThan(randomPrice);
    expect(randomPrice).toBeLessThan(Math.min(priceFor("volcano"), priceFor("sky"), priceFor("darkness"), priceFor("light")));
    expect(priceFor("volcano")).toBe(180);
    expect(priceFor("sky")).toBe(260);
    expect(priceFor("darkness")).toBe(280);
    expect(priceFor("light")).toBe(300);
    expect(listCreatureShopProducts("food").length).toBeGreaterThanOrEqual(3);
    expect(listCreatureShopProducts("hatch-accelerator").length).toBeGreaterThanOrEqual(2);
    expect(listCreatureShopProducts("background-effect")).toHaveLength(7);
  });

  it("prioritizes unowned random-egg lines and falls back to the full pool", () => {
    const fullPool = buildEffectiveRandomEggPool();
    expect(fullPool.map((entry) => entry.lineKey)).toEqual(CREATURE_RANDOM_EGG_WEIGHTS.map((entry) => entry.lineKey));
    expect(new Set(fullPool.map((entry) => entry.lineKey)).size).toBe(fullPool.length);

    const partial = buildEffectiveRandomEggPool(["terramote", "terramote", "not-a-line"]);
    expect(partial.some((entry) => entry.lineKey === "terramote")).toBe(false);
    expect(partial).toHaveLength(6);
    expect(new Set(partial.map((entry) => entry.lineKey)).size).toBe(partial.length);

    const allOwned = buildEffectiveRandomEggPool(CREATURE_LINES.map((line) => line.key));
    expect(allOwned).toEqual(fullPool);
  });

  it("builds an affinity pool from every matching line with explicit weights", () => {
    const syntheticLines = [
      { key: "earth-a", affinity: "earth", affinityEggWeight: 2 },
      { key: "earth-b", affinity: "earth", affinityEggWeight: 3 },
      { key: "river-a", affinity: "river", affinityEggWeight: 9 },
    ] as unknown as readonly CreatureLineDefinition[];
    const pool = buildAffinityEggPool("earth", syntheticLines);
    expect(pool).toEqual([
      { lineKey: "earth-a", weight: 2 },
      { lineKey: "earth-b", weight: 3 },
    ]);
    const drawablePool = [
      { lineKey: "terramote", weight: 2 },
      { lineKey: "ripplekin", weight: 3 },
    ] as const;
    expect(chooseWeightedCreatureLine(drawablePool, 0).key).toBe("terramote");
    expect(chooseWeightedCreatureLine(drawablePool, 1).key).toBe("terramote");
    expect(chooseWeightedCreatureLine(drawablePool, 2).key).toBe("ripplekin");
    expect(chooseWeightedCreatureLine(drawablePool, 4).key).toBe("ripplekin");
    expect(buildAffinityEggPool("sea", syntheticLines)).toEqual([]);
  });

  it("keeps global affinity totals ordered and publishes the v2 descriptions", () => {
    const totals = new Map(
      CREATURE_AFFINITIES.map((affinity) => [affinity, 0]),
    );
    for (const entry of CREATURE_RANDOM_EGG_WEIGHTS) {
      const line = CREATURE_LINES.find((candidate) => candidate.key === entry.lineKey);
      if (line) totals.set(line.affinity, (totals.get(line.affinity) ?? 0) + entry.weight);
    }
    expect(CREATURE_AFFINITIES.map((affinity) => totals.get(affinity))).toEqual([24, 20, 17, 13, 10, 8, 8]);
    expect(totals.get("earth")!).toBeGreaterThan(totals.get("river")!);
    expect(totals.get("river")!).toBeGreaterThan(totals.get("sea")!);
    expect(totals.get("sea")!).toBeGreaterThan(totals.get("volcano")!);
    expect(totals.get("volcano")!).toBeGreaterThan(totals.get("sky")!);
    expect(totals.get("sky")!).toBeGreaterThan(totals.get("darkness")!);
    expect(totals.get("sky")!).toBeGreaterThan(totals.get("light")!);

    expect(CREATURE_CATALOG_REVISION).toBe("creature-catalog-v2");
    const random = getCreatureShopProduct("egg-random-01")!;
    expect(random.descriptionKo).toContain("모든 종족/계열 중 하나를 가중 무작위로");
    for (const product of listCreatureShopProducts("affinity-egg")) {
      expect(product.descriptionKo).toContain("해당 종족/기운 안의 캐릭터 중 하나를 무작위로");
      expect(product.effect).not.toHaveProperty("lineKey");
    }
  });

  it("selects weighted boundaries deterministically and rejects invalid rolls", () => {
    const pool = [
      { lineKey: "terramote", weight: 2 },
      { lineKey: "ripplekin", weight: 1 },
    ] as const;
    expect(chooseWeightedCreatureLine(pool, 0).key).toBe("terramote");
    expect(chooseWeightedCreatureLine(pool, 1).key).toBe("terramote");
    expect(chooseWeightedCreatureLine(pool, 2).key).toBe("ripplekin");
    expect(chooseWeightedCreatureLineKey(pool, 2)).toBe("ripplekin");
    expect(() => chooseWeightedCreatureLine(pool, -1)).toThrow(RangeError);
    expect(() => chooseWeightedCreatureLine(pool, 3)).toThrow(RangeError);
    expect(() => chooseWeightedCreatureLine(pool, 1.5)).toThrow(RangeError);
  });

  it("handles growth thresholds and terminal evolution", () => {
    expect(getCreatureStageProgressThreshold("egg")).toBe(0);
    expect(getCreatureStageProgressThreshold("hatchling")).toBe(3);
    expect(getCreatureStageProgressThreshold("juvenile")).toBe(8);
    expect(getCreatureStageProgressThreshold("evolved")).toBe(15);
    expect(getNextCreatureStage("egg")).toBe("hatchling");
    expect(getNextCreatureStage("juvenile", 14)).toBeNull();
    expect(getNextCreatureStage("juvenile", 15)).toBe("evolved");
    expect(getNextCreatureStage("evolved")).toBeNull();
    expect(() => getNextCreatureStage("juvenile", -1)).toThrow(RangeError);
    expect(getCreatureStageForProgress(0)).toBe("egg");
    expect(getCreatureStageForProgress(3)).toBe("hatchling");
    expect(getCreatureStageForProgress(8)).toBe("juvenile");
    expect(getCreatureStageForProgress(15)).toBe("evolved");
    expect(() => getCreatureStageForProgress(-1)).toThrow(RangeError);
  });

  it("validates the complete catalog at runtime", () => {
    expect(CREATURE_CATALOG_VALIDATION).toEqual([]);
    expect(validateCreatureCatalog()).toEqual([]);
  });
});
