import { describe, expect, it, vi } from "vitest";

vi.mock("./slime-assets", () => ({
  EQUIPPED_FLOORS: [
    "none",
    "grass-floor",
    "water-puddle",
    "trampoline",
  ],
  SLIME_ASSET_COLORS: ["blue", "green", "yellow", "purple", "red"],
}));

import {
  buildSlimeShopOverviewSections,
  optimisticallyEquipSlimeItem,
  slimeBuffChipTier,
  slimeShopItemBuffLabel,
  slimeWardrobeFilterForItem,
  slimeWardrobeItemWearerLabel,
  slimeWardrobeNavItems,
} from "./slime-shop-presentation";
import {
  normalizeSlimeHome,
  type SlimeCatalogItem,
  type SlimeShopItem,
} from "./slimes";

const sceneBackground: SlimeShopItem = {
  key: "scene-night",
  labelKo: "밤하늘",
  category: "background",
  price: 1_000,
  floor: null,
  spritePath: "/scene.png",
};

const grassFloor: SlimeShopItem = {
  key: "grass-floor",
  labelKo: "잔디",
  category: "background",
  price: 500,
  floor: "grass-floor",
  spritePath: "/grass.png",
};

const glasses: SlimeShopItem = {
  key: "glasses",
  labelKo: "안경",
  category: "wearable",
  wearableRole: "eyewear",
  wearableOption: "round-glasses",
  price: 700,
  floor: null,
  spritePath: "/glasses.png",
  effectKey: "reading_reward",
  effectBps: 200,
};

const premiumGlasses: SlimeShopItem = {
  ...glasses,
  key: "premium-glasses",
  labelKo: "프리미엄 안경",
  wearableOption: "premium-glasses",
  effectBps: 300,
};

describe("mobile slime shop presentation", () => {
  it("keeps shop and wardrobe navigation in the stabilized order", () => {
    expect(slimeWardrobeNavItems([sceneBackground, grassFloor]).map((item) => item.key)).toEqual([
      "background",
      "floor",
      "vehicle",
      "drink",
      "prop",
      "outfit",
      "title",
    ]);
    expect(slimeWardrobeNavItems([grassFloor]).map((item) => item.key)).toEqual([
      "floor",
      "vehicle",
      "drink",
      "prop",
      "outfit",
      "title",
    ]);
  });

  it("classifies wardrobe items and formats compact buff metadata", () => {
    expect(slimeWardrobeFilterForItem(sceneBackground)).toBe("background");
    expect(slimeWardrobeFilterForItem(grassFloor)).toBe("floor");
    expect(slimeWardrobeFilterForItem(glasses)).toBe("outfit");
    expect(slimeShopItemBuffLabel(glasses)).toBe("독서 +2%");
    expect(slimeBuffChipTier(100)).toBe("bronze");
    expect(slimeBuffChipTier(200)).toBe("silver");
    expect(slimeBuffChipTier(300)).toBe("gold");
  });

  it("reports when an item will move from another pet", () => {
    expect(
      slimeWardrobeItemWearerLabel(
        glasses.key,
        "blue",
        { green: [glasses.key] },
        {
          blue: "블루",
          green: "그린",
          yellow: "옐로",
          purple: "퍼플",
          red: "레드",
        },
      ),
    ).toBe("그린");
  });

  it("builds all-category sections in purchase-count order", () => {
    const characters: SlimeCatalogItem[] = [
      {
        key: "blue",
        color: "blue",
        nameKo: "블루",
        price: 100,
        baseBuffBps: 100,
        effectKey: "growth_speed",
        purchaseCount: 1,
      },
      {
        key: "green",
        color: "green",
        nameKo: "그린",
        price: 200,
        baseBuffBps: 100,
        effectKey: "reading_reward",
        purchaseCount: 5,
      },
    ];
    const sections = buildSlimeShopOverviewSections(characters, [
      grassFloor,
      { ...glasses, purchaseCount: 1 },
      { ...premiumGlasses, purchaseCount: 8 },
    ]);

    expect(sections.map((section) => section.key)).toEqual([
      "character",
      "floor",
      "outfit",
    ]);
    expect(sections[0]?.characters.map((item) => item.key)).toEqual([
      "green",
      "blue",
    ]);
    expect(sections[2]?.items.map((item) => item.key)).toEqual([
      "premium-glasses",
      "glasses",
    ]);
  });

  it("optimistically moves one visual-slot item and preserves independent slots", () => {
    const home = normalizeSlimeHome({
      ownedColors: ["blue", "green"],
      representativeColor: "blue",
      shopCatalog: [grassFloor, glasses, premiumGlasses],
      equippedItemsByColor: {
        blue: [grassFloor.key, glasses.key],
        green: [premiumGlasses.key],
      },
      hiddenItemsByColor: { blue: [glasses.key] },
    });

    const result = optimisticallyEquipSlimeItem(
      home,
      "green",
      glasses,
      true,
    );

    expect(result.equippedItemsByColor.blue).toEqual([grassFloor.key]);
    expect(result.equippedItemsByColor.green).toEqual([glasses.key]);
    expect(result.hiddenItemsByColor.blue).toEqual([]);
    expect(result.equippedFloorByColor.blue).toBe("grass-floor");
  });
});
