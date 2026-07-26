import { describe, expect, it, vi } from "vitest";

vi.mock("./slime-assets", () => ({
  EQUIPPED_FLOORS: ["none", "grass-floor", "water-puddle", "trampoline"],
  SLIME_ASSET_COLORS: ["blue", "green", "yellow", "purple", "red"],
}));

import {
  calculateGrowthTimeComparison,
  calculateSlimeGrowthPercent,
  catalogHasSceneBackgrounds,
  isSceneBackgroundItem,
  normalizeSlimeHome,
  normalizeSlimeClassroom,
  resolveEquippedSceneBackground,
  resolveSlimeRemoteSpriteUri,
  shopFilterForItem,
  slimeBallSpritePath,
  slimeShopNavItems,
  slimeVisualItemSlot,
  SLIME_COOKIE_ITEM_KEY,
  studentPetHref,
} from "./slimes";

describe("mobile slime parity model", () => {
  it("normalizes the current home snapshot including cookie quantity and growth", () => {
    const home = normalizeSlimeHome({
      balance: 230,
      currency: { unitLabel: "원" },
      ownedColors: ["blue"],
      representativeColor: "blue",
      ownedItemKeys: [SLIME_COOKIE_ITEM_KEY],
      ownedItemQuantities: { [SLIME_COOKIE_ITEM_KEY]: 4 },
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
    expect(home.growthSpeedBps).toBe(200);
    expect(calculateSlimeGrowthPercent(home.growthByColor.blue!)).toBe(50);
  });

  it("maps API categories to shop tabs and keeps legacy floors separate from scene backgrounds", () => {
    const item = (
      category: "background" | "ride" | "drink" | "food" | "prop" | "level-up",
      floor: "grass-floor" | "water-puddle" | "trampoline" | null = null,
    ) => ({ category, floor });

    expect(isSceneBackgroundItem(item("background"))).toBe(true);
    expect(isSceneBackgroundItem(item("background", "grass-floor"))).toBe(false);
    expect(shopFilterForItem(item("background"))).toBe("background");
    expect(shopFilterForItem(item("background", "grass-floor"))).toBe("floor");
    expect(shopFilterForItem(item("ride", "trampoline"))).toBe("floor");
    expect(shopFilterForItem(item("food"))).toBe("food");
    expect(shopFilterForItem(item("drink"))).toBe("prop");
    expect(shopFilterForItem(item("prop"))).toBe("prop");
    expect(shopFilterForItem(item("level-up"))).toBe("level-up");
    expect(slimeVisualItemSlot(item("background"))).toBe("background");
    expect(slimeVisualItemSlot(item("background", "water-puddle"))).toBe("floor");
    expect(slimeVisualItemSlot(item("prop"))).toBe("accessory");
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
      "character",
      "floor",
      "food",
      "prop",
    ]);
    expect(catalogHasSceneBackgrounds(withScene)).toBe(true);
    expect(slimeShopNavItems(withScene).map((tab) => tab.key)).toEqual([
      "character",
      "background",
      "floor",
      "food",
      "prop",
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

  it("resolves the equipped ball animation for the slime color", () => {
    expect(slimeBallSpritePath(["slime-ball-soccer-ball"], "purple")).toBe(
      "/creatures/slimes/official/props/ball/soccer-ball/purple/slime-purple-soccer-ball-hit-4x.gif",
    );
    expect(slimeBallSpritePath(["slime-cookie"], "purple")).toBeUndefined();
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
          equippedTitleKey: null,
        },
      },
    ]);
  });
});
