import { describe, expect, it } from "vitest";
import rawCatalog from "@/data/pet-ecosystem.json";
import {
  PET_BACKGROUND_PRODUCTS,
  PET_ELEMENTS,
  PET_LINEAGES,
  PET_PRODUCTS,
  getPetLineage,
  parsePetCatalog,
} from "./catalog";

describe("elemental pet catalog", () => {
  it("contains one lineage per supported element and three stages each", () => {
    expect(PET_LINEAGES).toHaveLength(7);
    expect(new Set(PET_LINEAGES.map((lineage) => lineage.element))).toEqual(new Set(PET_ELEMENTS));
    expect(PET_LINEAGES.every((lineage) => lineage.stages.length === 3)).toBe(true);
    expect(PET_LINEAGES.every((lineage) => lineage.behaviorRows.length === 3)).toBe(true);
  });

  it("prices random eggs below targeted eggs and premium eggs above standard eggs", () => {
    const randomEgg = PET_PRODUCTS.find((product) => product.key === "egg-random");
    const earthEgg = PET_PRODUCTS.find((product) => product.key === "egg-earth");
    const lightEgg = PET_PRODUCTS.find((product) => product.key === "egg-light");
    expect(randomEgg?.price).toBeLessThan(earthEgg?.price ?? 0);
    expect(lightEgg?.price).toBeGreaterThan(earthEgg?.price ?? Infinity);
  });

  it("provides durable fitting-room backgrounds", () => {
    expect(PET_BACKGROUND_PRODUCTS.length).toBeGreaterThanOrEqual(3);
    expect(PET_BACKGROUND_PRODUCTS.every((product) => product.durable)).toBe(true);
  });

  it("rejects catalogs with a missing lineage", () => {
    const broken = structuredClone(rawCatalog) as typeof rawCatalog;
    broken.lineages.pop();
    expect(() => parsePetCatalog(broken)).toThrow(/seven elemental lineages/);
  });

  it("finds lineages by stable ID", () => {
    expect(getPetLineage("sky-zephyroo")?.elementLabel).toBe("하늘");
    expect(getPetLineage("missing")).toBeNull();
  });
});
