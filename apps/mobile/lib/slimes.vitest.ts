import { describe, expect, it, vi } from "vitest";

vi.mock("./slime-assets", () => ({
  EQUIPPED_FLOORS: ["none", "grass-floor", "water-puddle", "trampoline"],
  SLIME_ASSET_COLORS: ["blue", "green", "yellow", "purple", "red"],
}));

import {
  calculateGrowthTimeComparison,
  calculateSlimeGrowthPercent,
  normalizeSlimeHome,
  normalizeSlimeClassroom,
  shopFilterForItem,
  slimeBallSpritePath,
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

  it("maps API categories to the five Korean shop tabs", () => {
    const item = (category: "background" | "ride" | "drink" | "food" | "prop" | "level-up") => ({ category });
    expect(shopFilterForItem(item("background"))).toBe("floor");
    expect(shopFilterForItem(item("ride"))).toBe("floor");
    expect(shopFilterForItem(item("food"))).toBe("food");
    expect(shopFilterForItem(item("drink"))).toBe("prop");
    expect(shopFilterForItem(item("prop"))).toBe("prop");
    expect(shopFilterForItem(item("level-up"))).toBe("level-up");
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
        representative: {
          color: "purple",
          growthStage: 2,
          equippedItemKeys: ["water-puddle-background"],
        },
      },
      { id: "student-2", number: null, name: "바다", representative: null },
    ] })).toEqual([
      {
        id: "student-1",
        number: 3,
        name: "하늘",
        representative: {
          color: "purple",
          growthStage: 2,
          equippedItemKeys: ["water-puddle-background"],
        },
      },
      { id: "student-2", number: null, name: "바다", representative: null },
    ]);
  });
});
