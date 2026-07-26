import { describe, expect, it } from "vitest";

import {
  getEquippedSlimeFloor,
  isSlimeSceneBackground,
  normalizeEquippedSlimeItemKeys,
  SLIME_CATALOG,
  SLIME_BALL_CATALOG,
  SLIME_DEFAULT_BUFF_BPS,
  SLIME_DEFAULT_PRICE,
  SLIME_COOKIE_PRICE,
  SLIME_SHOP_DEFAULT_PRICE,
  SLIME_SHOP_CATALOG,
} from "./catalog";

const ANIMATED_BACKGROUND_CONTRACT = [
  ["aurora-dream-sky", 1_000, "assignment_reward", 300],
  ["cloud-garden", 700, "walking_reward", 200],
  ["dreamy-toy-room", 500, "assignment_reward", 100],
  ["enchanted-forest-canopy", 500, "reading_reward", 100],
  ["fizzy-soda-dream", 1_000, "comment_reward", 300],
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

  it("identifies the three floor choices semantically and keeps legacy item keys", () => {
    expect(SLIME_SHOP_CATALOG.map(({ key, floor }) => [key, floor])).toEqual([
      ["grass-floor-background", "grass-floor"],
      ["water-puddle-background", "water-puddle"],
      ["shooting-star-night-sky-background", null],
      ...ANIMATED_BACKGROUND_IDS.map((id) => [`${id}-background`, null]),
      ["slime-blue-trampoline", "trampoline"],
      ["slime-blue-drink-lemonade", null],
      ["slime-ball-american-football", null],
      ["slime-ball-baseball", null],
      ["slime-ball-basketball", null],
      ["slime-ball-black-ball", null],
      ["slime-ball-dark-blue-ball", null],
      ["slime-ball-soccer-ball", null],
      ["slime-ball-tennis-ball", null],
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

  it("registers exactly the 17 validated animated background variants", () => {
    const imported = SLIME_SHOP_CATALOG.filter((item) =>
      item.spritePath.includes("/shop/backgrounds/"),
    );

    expect(imported.map((item) => item.key)).toEqual(
      ANIMATED_BACKGROUND_IDS.map((id) => `${id}-background`),
    );
    for (const [index, item] of imported.entries()) {
      const [id, price, effectKey, effectBps] = ANIMATED_BACKGROUND_CONTRACT[index];
      const root = `/creatures/slimes/shop/backgrounds/${id}`;
      expect(item).toMatchObject({
        category: "background",
        floor: null,
        price,
        effectKey,
        effectBps,
        spritePath: `${root}/aura-package/${id}-6s-64.gif`,
        mobileSpritePath: `${root}/aura-package/${id}-6s-256.gif`,
        staticSpritePath: `${root}/static-background-64.png`,
      });
      expect(isSlimeSceneBackground(item)).toBe(true);
    }
    expect(SLIME_SHOP_CATALOG.some((item) =>
      item.key.includes("rainbow-prism-cosmos"),
    )).toBe(false);
  });

  it("uses the contracted 6/7/4 background price tiers", () => {
    const imported = SLIME_SHOP_CATALOG.filter((item) =>
      item.spritePath.includes("/shop/backgrounds/"),
    );

    expect(imported.filter((item) => item.price === 1_000)).toHaveLength(6);
    expect(imported.filter((item) => item.price === 700)).toHaveLength(7);
    expect(imported.filter((item) => item.price === 500)).toHaveLength(4);
    expect(imported.every((item) => item.effectKey !== "growth_speed")).toBe(true);
  });

  it("keeps every existing equippable prop in the 500 won 1% lower tier", () => {
    const importedKeys = new Set(
      ANIMATED_BACKGROUND_IDS.map((id) => `${id}-background`),
    );
    const existingCosmetics = SLIME_SHOP_CATALOG.filter(
      (item) => item.key !== "slime-cookie" && !importedKeys.has(item.key),
    );

    expect(existingCosmetics).toHaveLength(12);
    expect(existingCosmetics.every((item) => item.price === 500)).toBe(true);
    expect(existingCosmetics.every((item) => item.effectBps === 100)).toBe(true);
    expect(existingCosmetics.map(({ key, effectKey }) => [key, effectKey])).toEqual([
      ["grass-floor-background", "walking_reward"],
      ["water-puddle-background", "walking_reward"],
      ["shooting-star-night-sky-background", "assignment_reward"],
      ["slime-blue-trampoline", "walking_reward"],
      ["slime-blue-drink-lemonade", "comment_reward"],
      ...SLIME_BALL_CATALOG.map(({ key }) => [key, "walking_reward"]),
    ]);
  });

  it("normalizes visual equipment in background, floor, accessory order", () => {
    expect(normalizeEquippedSlimeItemKeys([
      "slime-blue-drink-lemonade",
      "grass-floor-background",
      "shooting-star-night-sky-background",
      "water-puddle-background",
    ])).toEqual([
      "shooting-star-night-sky-background",
      "water-puddle-background",
      "slime-blue-drink-lemonade",
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
      "water-puddle-background",
    ])).toBe("water-puddle");
    expect(getEquippedSlimeFloor(["slime-blue-drink-lemonade"])).toBe("none");
  });

});
