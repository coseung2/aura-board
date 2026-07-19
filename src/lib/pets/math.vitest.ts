import { describe, expect, it } from "vitest";
import {
  calculatePetEffects,
  effectivePetBuffBps,
  projectIncubation,
} from "./math";

describe("pet buff math", () => {
  it("applies the documented stage and enhancement formula", () => {
    expect(effectivePetBuffBps(1_000, 0, 10)).toBe(1_800);
    expect(effectivePetBuffBps(1_000, 1, 2)).toBe(1_760);
    expect(effectivePetBuffBps(1_000, 1, 3)).toBe(1_840);
  });

  it("uses only the highest fixed synergy tier", () => {
    const effects = calculatePetEffects(
      Array.from({ length: 5 }, (_, index) => ({
        type: "flame",
        effectKey: "hatch_speed" as const,
        label: `pet ${index}`,
        baseEffectBps: 100,
        stage: 0,
        enhancementLevel: 0,
      })),
    );
    expect(effects.hatchSpeedBps).toBe(1_300);
    expect(effects.breakdown.at(-1)?.bps).toBe(800);
  });
});

describe("incubation projection", () => {
  it("turns ten hours of work into 6h40m at +50% speed", () => {
    const start = new Date("2026-07-19T00:00:00.000Z");
    const projected = projectIncubation({
      progressSeconds: 0,
      lastProgressAt: start,
      asOf: start,
      baseHatchSeconds: 36_000,
      hatchSpeedBps: 5_000,
    });
    expect(projected.remainingSeconds).toBe(24_000);
  });

  it("clamps progress at completion and ignores negative elapsed time", () => {
    const projected = projectIncubation({
      progressSeconds: 99,
      lastProgressAt: new Date("2026-07-19T00:00:10.000Z"),
      asOf: new Date("2026-07-19T00:00:00.000Z"),
      baseHatchSeconds: 100,
      hatchSpeedBps: 0,
    });
    expect(projected).toEqual({
      progressSeconds: 99,
      remainingSeconds: 1,
      canHatch: false,
    });
  });
});

