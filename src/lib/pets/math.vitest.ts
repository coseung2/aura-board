import { describe, expect, it } from "vitest";

import {
  SLIME_EFFECT_CAP_BPS,
  calculateCatalogSlimeEffects,
  calculateSlimeEffects,
  formatBpsPercent,
  slimeBuffBpsForStage,
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

  it("adds an equipped scene background once per distinct item key", () => {
    const effects = calculateCatalogSlimeEffects([], [
      "cloud-garden-background",
      "cloud-garden-background",
    ]);

    expect(effects.totals.walking_reward).toBe(200);
    expect(effects.totalBps).toBe(200);
    expect(effects.breakdown).toEqual([
      expect.objectContaining({
        source: "background",
        key: "cloud-garden-background",
        effectKey: "walking_reward",
        bps: 200,
      }),
    ]);
  });

  it("adds lower-tier floor, prop, drink, and legacy scene buffs by item theme", () => {
    const effects = calculateCatalogSlimeEffects([], [
      "grass-floor-background",
      "slime-ball-baseball",
      "slime-blue-drink-lemonade",
      "shooting-star-night-sky-background",
      "shooting-star-night-sky-background",
    ]);

    expect(effects.totals.walking_reward).toBe(300);
    expect(effects.totals.comment_reward).toBe(0);
    expect(effects.totals.assignment_reward).toBe(100);
    expect(effects.totalBps).toBe(400);
    expect(effects.breakdown.map(({ source, bps }) => [source, bps])).toEqual([
      ["item", 100],
      ["item", 100],
      ["item", 100],
      ["background", 100],
    ]);
  });

  it("does not grant an equipment buff to consumable or unknown item keys", () => {
    const effects = calculateCatalogSlimeEffects([], ["slime-cookie", "unknown-item"]);

    expect(effects.totalBps).toBe(0);
    expect(effects.breakdown).toEqual([]);
  });

  it("sums effects without a ceiling", () => {
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
    expect(effects.totals.growth_speed).toBe(2_200);
    expect(effects.totalBps).toBe(2_200);
  });

  it("still honors an explicitly provided cap", () => {
    const effects = calculateSlimeEffects(
      [
        {
          key: "one",
          nameKo: "테스트 1",
          effectKey: "growth_speed",
          baseBuffBps: 1_900,
        },
      ],
      [],
      1_000,
    );

    expect(effects.totals.growth_speed).toBe(1_000);
  });

  it("formats basis points as percentages without trailing zeroes", () => {
    expect(formatBpsPercent(200)).toBe("2%");
    expect(formatBpsPercent(180)).toBe("1.8%");
    expect(formatBpsPercent(2_000)).toBe("20%");
  });

  it("doubles a slime's base buff at each growth stage", () => {
    expect(slimeBuffBpsForStage(200, 1)).toBe(200);
    expect(slimeBuffBpsForStage(200, 2)).toBe(400);
    expect(slimeBuffBpsForStage(200, 3)).toBe(800);

    const effects = calculateCatalogSlimeEffects(
      ["blue"],
      [],
      undefined,
      { blue: 3 },
    );
    expect(effects.totals.growth_speed).toBe(800);
    expect(effects.breakdown[0]).toMatchObject({ bps: 800 });
  });
});
