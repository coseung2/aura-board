import { describe, expect, it } from "vitest";

import {
  getEquippedSlimeFloor,
  isSlimeSceneBackground,
  normalizeEquippedSlimeItemKeys,
  slimeDrinkSpritePath,
  slimeShopPreviewColor,
  SLIME_CATALOG,
  SLIME_BALL_CATALOG,
  SLIME_DRINK_CATALOG,
  SLIME_DEFAULT_BUFF_BPS,
  SLIME_DEFAULT_PRICE,
  SLIME_COOKIE_PRICE,
  SLIME_SHOP_DEFAULT_PRICE,
  SLIME_SHOP_CATALOG,
} from "./catalog";
import { SLIME_WEARABLE_CATALOG } from "./wearable-catalog";

const ANIMATED_BACKGROUND_CONTRACT = [
  ["aurora-dream-sky", 1_000, "assignment_reward", 300],
  ["cloud-garden", 700, "walking_reward", 200],
  ["dreamy-toy-room", 500, "assignment_reward", 100],
  ["enchanted-forest-canopy", 500, "reading_reward", 100],
  ["fizzy-soda-dream", 700, "comment_reward", 200],
  ["cherry-cloud-ume", 1_000, "comment_reward", 300],
  ["four-season-sky", 1_000, "walking_reward", 300],
  ["jellyfish-ocean", 1_000, "reading_reward", 300],
  ["lavender-butterfly-sky", 700, "reading_reward", 200],
  ["meteor-festival-sky", 700, "walking_reward", 200],
  ["midnight-snow-cloud", 700, "assignment_reward", 200],
  ["moonlit-lake", 700, "reading_reward", 200],
  ["mushroom-village", 700, "comment_reward", 200],
  ["neon-space-station", 700, "assignment_reward", 200],
  ["rainy-window-cafe", 500, "comment_reward", 100],
  ["starry-workshop", 500, "assignment_reward", 100],
  ["sunset-lantern-sky", 1_000, "comment_reward", 300],
  ["tropical-fish-ocean", 1_000, "walking_reward", 300],
] as const;

const ANIMATED_BACKGROUND_IDS = ANIMATED_BACKGROUND_CONTRACT.map(([id]) => id);
const LOGICAL_128_BACKGROUND_IDS = new Set(["fizzy-soda-dream", "cherry-cloud-ume"]);
const STATIC_FLOOR_CONTRACT = [
  ["crystal-cave-floor", 1_000, "growth_speed", 300],
  ["moonlit-marble-floor", 1_000, "reading_reward", 300],
  ["royal-garden-floor", 1_000, "walking_reward", 300],
  ["celestial-gold-floor", 1_000, "assignment_reward", 300],
  ["snow-ground-floor", 700, "comment_reward", 200],
  ["ancient-brick-floor", 700, "assignment_reward", 200],
  ["cherry-stone-floor", 700, "comment_reward", 200],
  ["sand-trail-floor", 500, "walking_reward", 100],
  ["forest-soil-floor", 500, "reading_reward", 100],
  ["stone-floor", 500, "growth_speed", 100],
] as const;

describe("slime catalog", () => {
  it("maps every color to the contracted effect at a 2% buff and 500 won", () => {
    expect(SLIME_CATALOG.map(({ color, effectKey }) => [color, effectKey])).toEqual([
      ["blue", "growth_speed"],
      ["green", "reading_reward"],
      ["yellow", "walking_reward"],
      ["purple", "assignment_reward"],
      ["red", "comment_reward"],
    ]);
    expect(SLIME_CATALOG.every((slime) => slime.baseBuffBps === SLIME_DEFAULT_BUFF_BPS)).toBe(true);
    expect(SLIME_DEFAULT_PRICE).toBe(500);
    expect(SLIME_CATALOG.every((slime) => slime.price === SLIME_DEFAULT_PRICE)).toBe(true);
  });

  it("identifies every floor choice semantically and keeps legacy item keys", () => {
    expect(SLIME_SHOP_CATALOG.map(({ key, floor }) => [key, floor])).toEqual([
      ["grass-floor-background", "grass-floor"],
      ...STATIC_FLOOR_CONTRACT.map(([id]) => [id, id]),
      ["shooting-star-night-sky-background", null],
      ...ANIMATED_BACKGROUND_IDS.map((id) => [`${id}-background`, null]),
      // The trampoline moved to the vehicle category, which rides above the
      // floor instead of owning a floor state.
      ["slime-blue-trampoline", null],
      // Delivered vehicles ride above the floor too, so none of them carry one.
      ["slime-vehicle-donut-tube", null],
      ["slime-vehicle-open-convertible", null],
      ["slime-vehicle-hot-air-balloon", null],
      ["slime-blue-drink-lemonade", null],
      ["slime-red-drink-strawberry-soda", null],
      ["slime-green-drink-melon-soda", null],
      ["slime-purple-drink-grape-soda", null],
      ["slime-blue-drink-blue-ramune", null],
      ["slime-ball-american-football", null],
      ["slime-ball-baseball", null],
      ["slime-ball-basketball", null],
      ["slime-ball-black-ball", null],
      ["slime-ball-dark-blue-ball", null],
      ["slime-ball-soccer-ball", null],
      ["slime-ball-tennis-ball", null],
      ...SLIME_WEARABLE_CATALOG.map(({ key }) => [key, null]),
      ["slime-cookie", null],
    ]);
    expect(SLIME_SHOP_DEFAULT_PRICE).toBe(500);
    expect(SLIME_COOKIE_PRICE).toBe(30);
    expect(SLIME_SHOP_CATALOG.at(-1)).toMatchObject({
      key: "slime-cookie",
      category: "food",
      price: 30,
      spritePath: "/creatures/slimes/official/shared/cookie-shop-icon-256.png",
    });
  });

  it("distinguishes true scene backgrounds from legacy background floors", () => {
    const scene = SLIME_SHOP_CATALOG.find((item) => item.key === "shooting-star-night-sky-background")!;
    const legacyFloor = SLIME_SHOP_CATALOG.find((item) => item.key === "grass-floor-background")!;

    expect(scene).toMatchObject({
      category: "background",
      floor: null,
      labelKo: "별똥별 밤하늘",
      price: SLIME_SHOP_DEFAULT_PRICE,
      effectKey: "assignment_reward",
      effectBps: 100,
      spritePath: "/creatures/slimes/shop/shooting-star-night-sky.gif",
    });
    expect(isSlimeSceneBackground(scene)).toBe(true);
    expect(isSlimeSceneBackground(legacyFloor)).toBe(false);
  });

  it("distributes the ten static floors evenly across all five buffs", () => {
    const floors = STATIC_FLOOR_CONTRACT.map(([id, price, effectKey, effectBps]) => {
      const item = SLIME_SHOP_CATALOG.find((candidate) => candidate.key === id);
      expect(item).toMatchObject({ floor: id, category: "background", price, effectKey, effectBps });
      return item!;
    });
    for (const effectKey of ["growth_speed", "reading_reward", "walking_reward", "assignment_reward", "comment_reward"]) {
      expect(floors.filter((item) => item.effectKey === effectKey)).toHaveLength(2);
    }
  });

  it("registers exactly the 18 validated animated background variants", () => {
    const imported = SLIME_SHOP_CATALOG.filter((item) =>
      item.spritePath.includes("/shop/backgrounds/"),
    );

    expect(imported.map((item) => item.key)).toEqual(
      ANIMATED_BACKGROUND_IDS.map((id) => `${id}-background`),
    );
    for (const [index, item] of imported.entries()) {
      const [id, price, effectKey, effectBps] = ANIMATED_BACKGROUND_CONTRACT[index];
      const root = `/creatures/slimes/shop/backgrounds/${id}`;
      const logicalSize = LOGICAL_128_BACKGROUND_IDS.has(id) ? 128 : 64;
      expect(item).toMatchObject({
        category: "background",
        floor: null,
        price,
        effectKey,
        effectBps,
        spritePath: `${root}/aura-package/${id}-6s-${logicalSize}.gif`,
        mobileSpritePath: `${root}/aura-package/${id}-6s-128.gif`,
        staticSpritePath: `${root}/static-background-${logicalSize}.png`,
      });
      expect(isSlimeSceneBackground(item)).toBe(true);
    }
    expect(SLIME_SHOP_CATALOG.some((item) =>
      item.key.includes("rainbow-prism-cosmos"),
    )).toBe(false);
  });

  it("uses the contracted 6/8/4 background price tiers", () => {
    const imported = SLIME_SHOP_CATALOG.filter((item) =>
      item.spritePath.includes("/shop/backgrounds/"),
    );

    expect(imported.filter((item) => item.price === 1_000)).toHaveLength(6);
    expect(imported.filter((item) => item.price === 700)).toHaveLength(8);
    expect(imported.filter((item) => item.price === 500)).toHaveLength(4);
    expect(imported.every((item) => item.effectKey !== "growth_speed")).toBe(true);
  });

  it("keeps every existing equippable prop in the 500 won 1% lower tier", () => {
    const importedKeys = new Set(
      ANIMATED_BACKGROUND_IDS.map((id) => `${id}-background`),
    );
    const staticFloorKeys = new Set(STATIC_FLOOR_CONTRACT.map(([id]) => id));
    const existingCosmetics = SLIME_SHOP_CATALOG.filter(
      (item) => item.key !== "slime-cookie"
        && item.category !== "wearable"
        // Delivered vehicles are priced by their own tiers, so this guard stays
        // scoped to the props that predate them.
        && !item.key.startsWith("slime-vehicle-")
        && !importedKeys.has(item.key)
        && !staticFloorKeys.has(item.key),
    );

    expect(existingCosmetics).toHaveLength(15);
    expect(existingCosmetics.every((item) => item.price === 500)).toBe(true);
    expect(existingCosmetics.every((item) => item.effectBps === 100)).toBe(true);
    expect(existingCosmetics.map(({ key, effectKey }) => [key, effectKey])).toEqual([
      ["grass-floor-background", "walking_reward"],
      ["shooting-star-night-sky-background", "assignment_reward"],
      ["slime-blue-trampoline", "walking_reward"],
      ["slime-blue-drink-lemonade", "walking_reward"],
      ["slime-red-drink-strawberry-soda", "comment_reward"],
      ["slime-green-drink-melon-soda", "reading_reward"],
      ["slime-purple-drink-grape-soda", "assignment_reward"],
      ["slime-blue-drink-blue-ramune", "growth_speed"],
      ...SLIME_BALL_CATALOG.map(({ key }) => [key, "walking_reward"]),
    ]);
  });

  it("registers five lower-tier drinks with color-specific animation paths", () => {
    expect(SLIME_DRINK_CATALOG.map(({ labelKo, effectKey, animationKey }) => [
      labelKo,
      effectKey,
      animationKey,
    ])).toEqual([
      ["레모네이드", "walking_reward", "lemonade"],
      ["딸기 소다", "comment_reward", "strawberry-soda"],
      ["멜론 소다", "reading_reward", "melon-soda"],
      ["포도 소다", "assignment_reward", "grape-soda"],
      ["블루 하와이 소다", "growth_speed", "blue-ramune"],
    ]);
    expect(SLIME_DRINK_CATALOG.every((item) =>
      item.price === 500 && item.effectBps === 100,
    )).toBe(true);
    expect(slimeDrinkSpritePath(SLIME_DRINK_CATALOG[1]!, "purple")).toBe(
      "/creatures/slimes/shop/drinks/strawberry-soda/purple/slime-purple-drink-strawberry-soda.gif",
    );
    expect(slimeDrinkSpritePath(SLIME_DRINK_CATALOG[1]!, "purple", true)).toBe(
      "/creatures/slimes/shop/drinks/strawberry-soda/purple/slime-purple-drink-strawberry-soda-4x.gif",
    );
    expect(slimeShopPreviewColor(SLIME_DRINK_CATALOG[4]!, "blue")).toBe("red");
  });

  it("normalizes visual equipment in background, floor, vehicle, prop, and outfit slot order", () => {
    expect(normalizeEquippedSlimeItemKeys([
      "slime-blue-drink-lemonade",
      "slime-headwear-straw-hat",
      "slime-eyewear-round-glasses",
      "slime-blush-peach-brush-blush",
      "grass-floor-background",
      "shooting-star-night-sky-background",
      "slime-blue-trampoline",
    ])).toEqual([
      "shooting-star-night-sky-background",
      "grass-floor-background",
      // A vehicle holds its own slot, so it survives next to a background and a
      // floor instead of competing with them.
      "slime-blue-trampoline",
      "slime-blue-drink-lemonade",
      "slime-blush-peach-brush-blush",
      "slime-eyewear-round-glasses",
      "slime-headwear-straw-hat",
    ]);
  });

  it("exposes every imported ball family as a 500 won 1% walking prop", () => {
    expect(SLIME_BALL_CATALOG).toHaveLength(7);
    expect(SLIME_BALL_CATALOG.map(({ slug, key, labelKo }) => [slug, key, labelKo])).toEqual([
      ["american-football", "slime-ball-american-football", "미식축구공"],
      ["baseball", "slime-ball-baseball", "야구공"],
      ["basketball", "slime-ball-basketball", "농구공"],
      ["black-ball", "slime-ball-black-ball", "검은 공"],
      ["dark-blue-ball", "slime-ball-dark-blue-ball", "남색 공"],
      ["soccer-ball", "slime-ball-soccer-ball", "축구공"],
      ["tennis-ball", "slime-ball-tennis-ball", "테니스공"],
    ]);
    expect(SLIME_BALL_CATALOG.every((item) =>
      item.category === "prop" && item.floor === null && item.price === 500
      && item.effectKey === "walking_reward" && item.effectBps === 100
      && item.spritePath.endsWith("/blue/" + item.spritePath.split("/blue/")[1]),
    )).toBe(true);
  });

  it("uses the last equipped floor key for deterministic legacy recovery", () => {
    expect(getEquippedSlimeFloor([
      "slime-blue-trampoline",
      "slime-blue-drink-lemonade",
      "grass-floor-background",
    ])).toBe("grass-floor");
    // Vehicles carry no floor state, so they never win floor recovery.
    expect(getEquippedSlimeFloor(["slime-blue-trampoline"])).toBe("none");
    expect(getEquippedSlimeFloor(["slime-blue-drink-lemonade"])).toBe("none");
  });

});
