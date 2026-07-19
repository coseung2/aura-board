import { describe, expect, it } from "vitest";

import { SLIME_CATALOG, SLIME_DEFAULT_BUFF_BPS, SLIME_DEFAULT_PRICE } from "./catalog";

describe("slime catalog", () => {
  it("maps every color to the contracted effect at a 2% buff and 100 won", () => {
    expect(SLIME_CATALOG.map(({ color, effectKey }) => [color, effectKey])).toEqual([
      ["blue", "growth_speed"],
      ["green", "reading_reward"],
      ["yellow", "walking_reward"],
      ["purple", "assignment_reward"],
      ["red", "comment_reward"],
    ]);
    expect(SLIME_CATALOG.every((slime) => slime.baseBuffBps === SLIME_DEFAULT_BUFF_BPS)).toBe(true);
    expect(SLIME_CATALOG.every((slime) => slime.price === SLIME_DEFAULT_PRICE)).toBe(true);
  });
});
