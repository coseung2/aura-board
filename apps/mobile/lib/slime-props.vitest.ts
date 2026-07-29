import { describe, expect, it, vi } from "vitest";

vi.mock("./slime-props.generated", () => ({
  SLIME_MOBILE_BALL_PROP_REGISTRY: {
    "soccer-ball/purple": {
      slug: "soccer-ball",
      color: "purple",
      frameCount: 18,
      frameSize: 96,
      columns: 6,
      imageScale: 4,
      durations: Array.from({ length: 18 }, () => 100),
      actionSheet: 1,
      overlaySheet: 2,
    },
  },
}));

import {
  resolveEquippedSlimePropAction,
  resolveSlimePropAction,
  slimePropFrameOffset,
} from "./slime-props";
import type { SlimeShopItem } from "./slimes";

const catalog = [
  { key: "slime-drink-lemonade", category: "drink", animationKey: "lemonade" },
  { key: "slime-ball-tennis-ball", category: "prop" },
  { key: "slime-ball-soccer-ball", category: "prop" },
] as SlimeShopItem[];

describe("slime prop actions", () => {
  it("chooses a ball ahead of a drink without depending on equipped order", () => {
    const equipped = ["slime-drink-lemonade", "slime-ball-tennis-ball"];
    expect(resolveEquippedSlimePropAction(equipped, catalog)).toEqual({
      kind: "ball",
      itemKey: "slime-ball-tennis-ball",
      slug: "tennis-ball",
    });
    expect(resolveEquippedSlimePropAction([...equipped].reverse(), catalog)).toEqual({
      kind: "ball",
      itemKey: "slime-ball-tennis-ball",
      slug: "tennis-ball",
    });
    expect(equipped).toEqual(["slime-drink-lemonade", "slime-ball-tennis-ball"]);
  });

  it("uses a stable key tie-breaker between balls", () => {
    expect(resolveEquippedSlimePropAction([
      "slime-ball-tennis-ball",
      "slime-ball-soccer-ball",
    ], catalog)?.itemKey).toBe("slime-ball-soccer-ball");
  });

  it("lets an explicit happy interaction finish before equipped prop actions resume", () => {
    const drink = { kind: "drink", itemKey: "drink", flavor: "lemonade" } as const;
    const ball = { kind: "ball", itemKey: "ball", slug: "soccer-ball" } as const;
    for (const prop of [drink, ball]) {
      expect(resolveSlimePropAction("happy", prop, "none")).toEqual({
        prop: null,
        characterAction: "happy",
        wearableAction: "happy",
        priority: 0,
      });
    }
    expect(resolveSlimePropAction("idle", drink, "none").priority).toBe(100);
    expect(resolveSlimePropAction("idle", ball, "none").priority).toBe(200);
  });

  it("addresses every 96px atlas cell without crossing rows", () => {
    const entry = { columns: 6, frameCount: 18, frameSize: 96, imageScale: 4 };
    expect(slimePropFrameOffset(0, entry, 0.25)).toEqual({ left: 0, top: 0 });
    expect(slimePropFrameOffset(5, entry, 0.25)).toEqual({ left: -480, top: 0 });
    expect(slimePropFrameOffset(6, entry, 0.25)).toEqual({ left: 0, top: -96 });
    expect(slimePropFrameOffset(17, entry, 0.25)).toEqual({ left: -480, top: -192 });
  });
});
