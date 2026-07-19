import { describe, expect, it } from "vitest";

import {
  SLIME_EFFECT_CAP_BPS,
  calculateCatalogSlimeEffects,
  calculateSlimeEffects,
  formatBpsPercent,
} from "./math";

describe("slime buff math", () => {
  it("sums each slime's own buff without growth or stage inputs", () => {
    const effects = calculateCatalogSlimeEffects(["blue", "green"]);

    expect(effects.totals.growth_speed).toBe(200);
    expect(effects.totals.reading_reward).toBe(200);
    expect(effects.totalBps).toBe(400);
    expect(effects.breakdown.map((entry) => entry.source)).toEqual([
      "slime",
      "slime",
    ]);
  });

  it("adds a complete accessory set once and leaves partial sets inactive", () => {
    const partial = calculateCatalogSlimeEffects(["blue"], ["aqua-ribbon"]);
    expect(partial.activeSetKeys).toEqual([]);
    expect(partial.totals.growth_speed).toBe(200);

    const complete = calculateCatalogSlimeEffects(
      ["blue"],
      ["aqua-ribbon", "aqua-crown", "aqua-shell"],
    );
    expect(complete.activeSetKeys).toEqual(["aqua"]);
    expect(complete.totals.growth_speed).toBe(380);
    expect(complete.breakdown.at(-1)).toMatchObject({ source: "set", bps: 180 });
  });

  it("caps each effect while retaining the uncapped audit total", () => {
    const effects = calculateSlimeEffects(
      [
        {
          key: "one",
          nameKo: "테스트 1",
          effectKey: "growth_speed",
          baseBuffBps: 1_900,
        },
        {
          key: "two",
          nameKo: "테스트 2",
          effectKey: "growth_speed",
          baseBuffBps: 300,
        },
      ],
      [],
    );

    expect(effects.uncappedTotals.growth_speed).toBe(2_200);
    expect(effects.totals.growth_speed).toBe(SLIME_EFFECT_CAP_BPS);
    expect(effects.totalBps).toBe(SLIME_EFFECT_CAP_BPS);
  });

  it("formats basis points as percentages without trailing zeroes", () => {
    expect(formatBpsPercent(200)).toBe("2%");
    expect(formatBpsPercent(180)).toBe("1.8%");
    expect(formatBpsPercent(SLIME_EFFECT_CAP_BPS)).toBe("20%");
  });
});
