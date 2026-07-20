import { describe, expect, it } from "vitest";

import {
  getEquippedSlimeFloor,
  SLIME_CATALOG,
  SLIME_BALL_CATALOG,
  SLIME_DEFAULT_BUFF_BPS,
  SLIME_DEFAULT_PRICE,
  SLIME_COOKIE_PRICE,
  SLIME_SHOP_DEFAULT_PRICE,
  SLIME_SHOP_CATALOG,
} from "./catalog";

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
    expect(SLIME_SHOP_DEFAULT_PRICE).toBe(100);
    expect(SLIME_COOKIE_PRICE).toBe(30);
    expect(SLIME_SHOP_CATALOG.slice(0, 4).every((item) => item.price === 100)).toBe(true);
    expect(SLIME_SHOP_CATALOG.at(-1)).toMatchObject({
      key: "slime-cookie",
      category: "food",
      price: 30,
      spritePath: "/creatures/slimes/official/shared/cookie-shop-icon-256.png",
    });
  });

  it("exposes every imported ball family as a 100 won prop", () => {
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
      item.category === "prop" && item.floor === null && item.price === 100
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
