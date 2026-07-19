import { describe, expect, it } from "vitest";
import { getPetLineage, getPetProduct } from "./catalog";
import {
  applyHatchPoints,
  applyPetFood,
  canEvolvePet,
  evolvePet,
  nextEvolutionThreshold,
  progressPercent,
} from "./progression";

const earth = getPetLineage("earth-mossling")!;
const food = getPetProduct("food-sunberry")!;

describe("pet progression", () => {
  it("auto-hatches an egg when progress reaches its requirement", () => {
    const result = applyHatchPoints(
      { stage: 0, hatchProgress: 70, hatchRequired: 100, experience: 0 },
      55,
    );
    expect(result.stage).toBe(1);
    expect(result.hatched).toBe(true);
    expect(result.hatchProgress).toBe(100);
  });

  it("food advances eggs and grants experience after hatching", () => {
    expect(
      applyPetFood({ stage: 0, hatchProgress: 0, hatchRequired: 100, experience: 0 }, food)
        .hatchProgress,
    ).toBe(12);
    expect(
      applyPetFood({ stage: 1, hatchProgress: 100, hatchRequired: 100, experience: 10 }, food)
        .experience,
    ).toBe(40);
  });

  it("requires the next stage threshold before evolving", () => {
    expect(nextEvolutionThreshold(earth, 1)).toBe(80);
    expect(canEvolvePet(earth, { stage: 1, hatchProgress: 100, hatchRequired: 100, experience: 79 })).toBe(false);
    const evolved = evolvePet(earth, { stage: 1, hatchProgress: 100, hatchRequired: 100, experience: 80 });
    expect(evolved?.stage).toBe(2);
    expect(evolved?.evolved).toBe(true);
  });

  it("does not evolve eggs or final-stage pets", () => {
    expect(evolvePet(earth, { stage: 0, hatchProgress: 100, hatchRequired: 100, experience: 999 })).toBeNull();
    expect(evolvePet(earth, { stage: 3, hatchProgress: 100, hatchRequired: 100, experience: 999 })).toBeNull();
  });

  it("normalizes progress for meters", () => {
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(200, 100)).toBe(100);
    expect(progressPercent(-1, 100)).toBe(0);
  });
});
