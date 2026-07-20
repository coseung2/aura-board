import { describe, expect, it } from "vitest";

import {
  getEquippedSlimeFloor,
  SLIME_CATALOG,
  SLIME_DEFAULT_BUFF_BPS,
  SLIME_DEFAULT_PRICE,
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
    ]);
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
