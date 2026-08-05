import { describe, expect, it, vi } from "vitest";

vi.mock("./slime-assets", () => ({
  EQUIPPED_FLOORS: [
    "none", "grass-floor", "crystal-cave-floor", "moonlit-marble-floor",
    "royal-garden-floor", "celestial-gold-floor", "snow-ground-floor",
    "ancient-brick-floor", "cherry-stone-floor", "sand-trail-floor",
    "forest-soil-floor", "stone-floor", "water-puddle", "trampoline",
  ],
  SLIME_ASSET_COLORS: ["blue", "green", "yellow", "purple", "red"],
}));

import {
  aggregateMobileSlimeBuffTotals,
  calculateGrowthTimeComparison,
  calculateSlimeGrowthPercent,
  catalogHasSceneBackgrounds,
  groupSlimeShopItemsByTier,
  isSceneBackgroundItem,
  mobileSlimeBuffGroups,
  normalizeSlimeHome,
  normalizeSlimeClassroom,
  resolveEquippedSceneBackground,
  resolveEquippedSlimeWearables,
  resolveSlimeRemoteSpriteUri,
  selectSceneBackgroundSpritePath,
  shopFilterForItem,
  slimeBallSpritePath,
  slimeDrinkSpritePath,
  slimeShopPreviewColor,
  slimeShopNavItems,
  slimeVisualItemSlot,
  SLIME_COOKIE_ITEM_KEY,
  studentPetHref,
  type SlimeShopItem,
} from "./slimes";
import {
  SCENE_BACKGROUND_FEATHER_RATIO,
  sceneBackgroundFeatherInset,
} from "../components/slime/slime-types";

describe("mobile slime parity model", () => {
  it("normalizes the current home snapshot including cookie quantity and growth", () => {
    const home = normalizeSlimeHome({
      balance: 230,
      currency: { unitLabel: "원" },
      ownedColors: ["blue"],
      representativeColor: "blue",
      ownedItemKeys: [SLIME_COOKIE_ITEM_KEY],
      ownedItemQuantities: { [SLIME_COOKIE_ITEM_KEY]: 4 },
      hiddenItemsByColor: { blue: ["water-puddle-background"] },
      growthSpeedBps: 200,
      growthByColor: {
        blue: {
          stage: 1,
          growthSeconds: 432_000,
          remainingSeconds: 432_000,
          remainingMinutes: 7_200,
          growthAppliedSpeedBps: 200,
        },
      },
    });

    expect(home.representativeColor).toBe("blue");
    expect(home.ownedItemQuantities[SLIME_COOKIE_ITEM_KEY]).toBe(4);
    expect(home.hiddenItemsByColor).toEqual({ blue: ["water-puddle-background"] });
    expect(home.growthSpeedBps).toBe(200);
    expect(calculateSlimeGrowthPercent(home.growthByColor.blue!)).toBe(50);
  });

  it("shows carried growth below one percent instead of resetting it to zero", () => {
    const stageTwoStart = 10 * 86_400;
    const carriedSeconds = Math.round(0.004 * 15 * 86_400);

    expect(calculateSlimeGrowthPercent({
      stage: 2,
      growthSeconds: stageTwoStart + carriedSeconds,
    })).toBe(0.4);
  });

  it("maps API categories to shop tabs and keeps legacy floors separate from scene backgrounds", () => {
    const item = (
      category: "background" | "ride" | "vehicle" | "drink" | "food" | "prop" | "wearable" | "level-up",
      floor: SlimeShopItem["floor"] = null,
      wearableRole?: "blush" | "eyewear" | "headwear",
    ) => ({ category, floor, wearableRole });

    expect(isSceneBackgroundItem(item("background"))).toBe(true);
    expect(isSceneBackgroundItem(item("background", "grass-floor"))).toBe(false);
    expect(shopFilterForItem(item("background"))).toBe("background");
    expect(shopFilterForItem(item("background", "grass-floor"))).toBe("floor");
    expect(shopFilterForItem(item("ride", "trampoline"))).toBe("vehicle");
    expect(shopFilterForItem(item("vehicle"))).toBe("vehicle");
    expect(shopFilterForItem(item("food"))).toBe("food");
    expect(shopFilterForItem(item("drink"))).toBe("prop");
    expect(shopFilterForItem(item("prop"))).toBe("prop");
    expect(shopFilterForItem(item("wearable", null, "eyewear"))).toBe("outfit");
    expect(shopFilterForItem(item("level-up"))).toBe("level-up");
    expect(slimeVisualItemSlot(item("background"))).toBe("background");
    expect(slimeVisualItemSlot(item("background", "water-puddle"))).toBe("floor");
    expect(slimeVisualItemSlot(item("prop"))).toBe("prop");
    expect(slimeVisualItemSlot(item("wearable", null, "blush"))).toBe("blush");
  });

  it("shows the background shop tab only when the catalog has a true scene background", () => {
    const legacyOnly = [
      { category: "background" as const, floor: "grass-floor" as const },
      { category: "ride" as const, floor: "trampoline" as const },
    ];
    const withScene = [
      ...legacyOnly,
      {
        key: "shooting-star-night-sky-background",
        category: "background" as const,
        floor: null,
        labelKo: "별똥별 밤하늘",
        price: 100,
        spritePath: "/creatures/slimes/shop/shooting-star-night-sky.gif",
      },
    ];

    expect(catalogHasSceneBackgrounds(legacyOnly)).toBe(false);
    expect(slimeShopNavItems(legacyOnly).map((tab) => tab.key)).toEqual([
      "all",
      "character",
      "floor",
      "vehicle",
      "food",
      "prop",
      "outfit",
    ]);
    expect(catalogHasSceneBackgrounds(withScene)).toBe(true);
    expect(slimeShopNavItems(withScene).map((tab) => tab.key)).toEqual([
      "all",
      "background",
      "character",
      "floor",
      "vehicle",
      "food",
      "prop",
      "outfit",
    ]);
  });

  it("resolves remote and API-relative background paths and the equipped scene background", () => {
    expect(
      resolveSlimeRemoteSpriteUri(
        "/creatures/slimes/shop/shooting-star-night-sky.gif",
        "https://api.example.com",
      ),
    ).toBe("https://api.example.com/creatures/slimes/shop/shooting-star-night-sky.gif");
    expect(
      resolveSlimeRemoteSpriteUri(
        "https://cdn.example.com/bg.gif",
        "https://api.example.com",
      ),
    ).toBe("https://cdn.example.com/bg.gif");

    const catalog = [
      {
        key: "grass-floor-background",
        category: "background" as const,
        floor: "grass-floor" as const,
        labelKo: "잔디 바닥",
        price: 100,
        spritePath: "/creatures/slimes/official/shared/grass-floor.png",
      },
      {
        key: "shooting-star-night-sky-background",
        category: "background" as const,
        floor: null,
        labelKo: "별똥별 밤하늘",
        price: 100,
        spritePath: "/creatures/slimes/shop/shooting-star-night-sky.gif",
      },
    ];
    expect(
      resolveEquippedSceneBackground(
        ["grass-floor-background", "shooting-star-night-sky-background"],
        catalog,
      )?.key,
    ).toBe("shooting-star-night-sky-background");
    expect(resolveEquippedSceneBackground(["grass-floor-background"], catalog)).toBeNull();
  });

  it("normalizes optional high-density and static scene background paths", () => {
    const home = normalizeSlimeHome({
      shopCatalog: [{
        key: "shooting-star-night-sky-background",
        category: "background",
        floor: null,
        spritePath: "/background-64.gif",
        mobileSpritePath: "/background-256.gif",
        staticSpritePath: "/static-background-64.png",
        animationKey: "shooting-star-night-sky",
        effectKey: "walking_reward",
        effectBps: 300,
      }],
    });

    expect(home.shopCatalog[0]).toMatchObject({
      spritePath: "/background-64.gif",
      mobileSpritePath: "/background-256.gif",
      staticSpritePath: "/static-background-64.png",
      animationKey: "shooting-star-night-sky",
      effectKey: "walking_reward",
      effectBps: 300,
    });
  });

  it("preserves explicit vehicle tiers while keeping price-based group labels", () => {
    const home = normalizeSlimeHome({
      shopCatalog: [
        {
          key: "vehicle-tier-1",
          category: "vehicle",
          floor: null,
          labelKo: "최고급 탈것",
          price: 1_000,
          tier: 1,
          spritePath: "/tier-1.png",
        },
        {
          key: "vehicle-tier-2",
          category: "vehicle",
          floor: null,
          labelKo: "고급 탈것",
          price: 700,
          tier: 2,
          spritePath: "/tier-2.png",
          vehicleOffsetX: 2.9,
        },
        {
          key: "vehicle-tier-3",
          category: "vehicle",
          floor: null,
          labelKo: "기본 탈것",
          price: 500,
          tier: 3,
          spritePath: "/tier-3.png",
        },
      ],
    });

    expect(home.shopCatalog.map(({ tier, price }) => [tier, price])).toEqual([
      [1, 1_000],
      [2, 700],
      [3, 500],
    ]);
    expect(home.shopCatalog[1]?.vehicleOffsetX).toBe(2);
    expect(groupSlimeShopItemsByTier(home.shopCatalog).map(({ price, label }) => [price, label])).toEqual([
      [500, "기본"],
      [700, "고급"],
      [1_000, "최고급"],
    ]);
  });

  it("normalizes imported wearable metadata and routes it to the outfit tab", () => {
    const home = normalizeSlimeHome({
      shopCatalog: [{
        key: "slime-eyewear-round-glasses",
        category: "wearable",
        floor: null,
        labelKo: "둥근 안경",
        price: 100,
        spritePath: "/wearables/eyewear/round-glasses/idle.png",
        wearableRole: "eyewear",
        wearableOption: "round-glasses",
      }],
    });

    expect(home.shopCatalog[0]).toMatchObject({
      category: "wearable",
      wearableRole: "eyewear",
      wearableOption: "round-glasses",
    });
    expect(shopFilterForItem(home.shopCatalog[0]!)).toBe("outfit");
  });

  it("resolves independent wearable slots together with the equipped drink flavor", () => {
    const catalog = normalizeSlimeHome({
      shopCatalog: [
        {
          key: "slime-blush-peach-brush-blush",
          category: "wearable",
          floor: null,
          labelKo: "복숭아 블러셔",
          price: 80,
          spritePath: "/blush.png",
          wearableRole: "blush",
          wearableOption: "peach-brush-blush",
        },
        {
          key: "slime-eyewear-round-glasses",
          category: "wearable",
          floor: null,
          labelKo: "둥근 안경",
          price: 100,
          spritePath: "/glasses.png",
          wearableRole: "eyewear",
          wearableOption: "round-glasses",
        },
        {
          key: "slime-headwear-straw-hat",
          category: "wearable",
          floor: null,
          labelKo: "밀짚모자",
          price: 120,
          spritePath: "/hat.png",
          wearableRole: "headwear",
          wearableOption: "straw-hat",
          wearableAssetPath: "/api/slime-assets/wearables/headwear/straw-hat",
        },
        {
          key: "slime-blue-drink-lemonade",
          category: "drink",
          floor: null,
          labelKo: "레모네이드",
          price: 500,
          spritePath: "/lemonade.gif",
          animationKey: "lemonade",
        },
      ],
    }).shopCatalog;

    expect(resolveEquippedSlimeWearables([
      "slime-blush-peach-brush-blush",
      "slime-eyewear-round-glasses",
      "slime-headwear-straw-hat",
      "slime-blue-drink-lemonade",
    ], catalog)).toEqual({
      blush: "peach-brush-blush",
      eyewear: "round-glasses",
      headwear: "straw-hat",
      drink: "lemonade",
      assetPaths: {
        headwear: "/api/slime-assets/wearables/headwear/straw-hat",
      },
    });
  });

  it("lists every buff per pet and aggregates duplicate effect types in its summary", () => {
    const home = normalizeSlimeHome({
      ownedColors: ["blue"],
      catalog: [{
        key: "blue",
        color: "blue",
        nameKo: "파란 슬라임",
        effectKey: "growth_speed",
        baseBuffBps: 100,
        price: 100,
      }],
      equippedItemsByColor: {
        blue: ["reading-background"],
      },
      shopCatalog: [{
        key: "reading-background",
        category: "background",
        floor: null,
        labelKo: "독서 배경",
        price: 500,
        spritePath: "/reading.gif",
        effectKey: "reading_reward",
        effectBps: 100,
      }],
      claimedTitles: [{
        key: "reading-title",
        label: "독서 칭호",
        imagePath: "/reading-title.png",
        effectKey: "reading_reward",
        buffBps: 200,
      }],
      equippedTitleByColor: { blue: "reading-title" },
    });

    const groups = mobileSlimeBuffGroups(home);
    expect(groups).toEqual([{
      color: "blue",
      label: "파란 슬라임",
      entries: [
        { source: "slime", key: "blue", label: "펫 기본 효과", effectKey: "growth_speed", bps: 100 },
        { source: "background", key: "reading-background", label: "독서 배경", effectKey: "reading_reward", bps: 100 },
        { source: "title", key: "reading-title", label: "독서 칭호", effectKey: "reading_reward", bps: 200 },
      ],
      totals: [
        { effectKey: "growth_speed", bps: 100 },
        { effectKey: "reading_reward", bps: 300 },
      ],
    }]);
    expect(aggregateMobileSlimeBuffTotals(groups)).toEqual([
      { effectKey: "growth_speed", bps: 100 },
      { effectKey: "reading_reward", bps: 300 },
      { effectKey: "walking_reward", bps: 0 },
      { effectKey: "assignment_reward", bps: 0 },
      { effectKey: "comment_reward", bps: 0 },
    ]);
  });

  it("selects the mobile scene background before the standard GIF and falls back safely", () => {
    expect(selectSceneBackgroundSpritePath({
      mobileSpritePath: "/background-256.gif",
      spritePath: "/background-64.gif",
    })).toBe("/background-256.gif");
    expect(selectSceneBackgroundSpritePath({ spritePath: "/background-64.gif" })).toBe(
      "/background-64.gif",
    );
  });

  it("keeps the scene background feather contract proportional to the rendered asset", () => {
    expect(SCENE_BACKGROUND_FEATHER_RATIO).toBe(0.1875);
    expect(sceneBackgroundFeatherInset(64)).toBe(12);
    expect(sceneBackgroundFeatherInset(256)).toBe(48);
    expect(sceneBackgroundFeatherInset(0)).toBe(0);
  });

  it("resolves the equipped ball animation for the slime color", () => {
    expect(slimeBallSpritePath(["slime-ball-soccer-ball"], "purple")).toBe(
      "/creatures/slimes/official/props/ball/soccer-ball/purple/slime-purple-soccer-ball-hit-4x.gif",
    );
    expect(slimeBallSpritePath(["slime-cookie"], "purple")).toBeUndefined();
  });

  it("resolves the equipped drink animation for the slime color and density", () => {
    const item = {
      category: "drink" as const,
      animationKey: "blue-ramune",
    };
    expect(slimeDrinkSpritePath(item, "red")).toBe(
      "/creatures/slimes/shop/drinks/blue-ramune/red/slime-red-drink-blue-ramune-4x.gif",
    );
    expect(slimeDrinkSpritePath(item, "red", false)).toBe(
      "/creatures/slimes/shop/drinks/blue-ramune/red/slime-red-drink-blue-ramune.gif",
    );
  });

  it("uses the configured preview colour for a visually overlapping drink", () => {
    expect(slimeShopPreviewColor({ previewColor: "red" }, "blue")).toBe("red");
    expect(slimeShopPreviewColor({}, "purple")).toBe("purple");
  });

  it("compares growth time with the active buff and exposes direct pet routes", () => {
    expect(calculateGrowthTimeComparison(10_200, 200)).toEqual({
      withoutBuffSeconds: 10_200,
      withBuffSeconds: 10_000,
    });
    expect(studentPetHref("mine")).toBe("/(student)/slime?section=mine");
    expect(studentPetHref("classroom")).toBe("/(student)/slime?section=classroom");
  });

  it("normalizes the classroom representative contract without inventing pets", () => {
    expect(normalizeSlimeClassroom({ students: [
      {
        id: "student-1",
        number: 3,
        name: "하늘",
        walkingTitle: {
          key: "weekly-50k",
          label: "꾸준한 발걸음",
          imagePath: "/walking/titles/weekly-50k-pixel-512.png",
        },
        representative: {
          color: "purple",
          growthStage: 2,
          equippedItemKeys: ["water-puddle-background"],
          hiddenItemKeys: ["water-puddle-background"],
          equippedTitleKey: "weekly-50k",
        },
      },
      {
        id: "student-2",
        number: null,
        name: "바다",
        walkingTitle: null,
        representative: null,
      },
      {
        id: "student-3",
        number: 7,
        name: "별",
        walkingTitle: {
          key: "daily-20k",
          label: "오늘의 질주",
          imagePath: "/walking/titles/daily-20k-pixel-512.png",
        },
        representative: {
          color: "green",
          growthStage: 1,
          equippedItemKeys: [],
          hiddenItemKeys: [],
          equippedTitleKey: null,
        },
      },
    ] })).toEqual([
      {
        id: "student-1",
        number: 3,
        name: "하늘",
        walkingTitle: {
          key: "weekly-50k",
          label: "꾸준한 발걸음",
          imagePath: "/walking/titles/weekly-50k-pixel-512.png",
        },
        representative: {
          color: "purple",
          growthStage: 2,
          equippedItemKeys: ["water-puddle-background"],
          hiddenItemKeys: ["water-puddle-background"],
          equippedTitleKey: "weekly-50k",
        },
      },
      {
        id: "student-2",
        number: null,
        name: "바다",
        walkingTitle: null,
        representative: null,
      },
      {
        id: "student-3",
        number: 7,
        name: "별",
        walkingTitle: {
          key: "daily-20k",
          label: "오늘의 질주",
          imagePath: "/walking/titles/daily-20k-pixel-512.png",
        },
        representative: {
          color: "green",
          growthStage: 1,
          equippedItemKeys: [],
          hiddenItemKeys: [],
          equippedTitleKey: null,
        },
      },
    ]);
  });
});
