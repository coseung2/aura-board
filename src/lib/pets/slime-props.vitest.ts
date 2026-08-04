import { describe, expect, it } from "vitest";

import {
  resolveEquippedSlimePropAction,
  resolveSlimeBallPropAsset,
  resolveSlimePropAction,
  slimePropFrameOffset,
} from "./slime-props";

describe("slime-props", () => {
  it("prefers an equipped ball over a drink without mutating equipment", () => {
    const catalog = [
      { key: "slime-red-drink-strawberry-soda", category: "drink", animationKey: "strawberry-soda" },
      { key: "slime-ball-baseball", category: "prop" },
    ];
    const equipped = ["slime-red-drink-strawberry-soda", "slime-ball-baseball"];
    expect(resolveEquippedSlimePropAction(equipped, catalog)).toEqual({
      kind: "ball",
      itemKey: "slime-ball-baseball",
      slug: "baseball",
    });
    expect(resolveEquippedSlimePropAction([...equipped].reverse(), catalog)).toEqual({
      kind: "ball",
      itemKey: "slime-ball-baseball",
      slug: "baseball",
    });
  });

  it("resolves drink and ball priorities against ambient actions", () => {
    const drink = {
      kind: "drink" as const,
      itemKey: "slime-red-drink-strawberry-soda",
      flavor: "strawberry-soda",
    };
    const ball = {
      kind: "ball" as const,
      itemKey: "slime-ball-baseball",
      slug: "baseball" as const,
    };
    expect(resolveSlimePropAction("happy", ball, "none")).toEqual({
      prop: null,
      characterAction: "happy",
      wearableAction: "happy",
      priority: 0,
    });
    expect(resolveSlimePropAction("idle", drink, "none").priority).toBe(100);
    expect(resolveSlimePropAction("idle", ball, "none")).toMatchObject({
      prop: ball,
      characterAction: "idle",
      wearableAction: "ball-hit",
      priority: 200,
    });
  });

  it("packs ball frames on the 96px scene grid", () => {
    const entry = resolveSlimeBallPropAsset("baseball", "red");
    expect(entry.frameSize).toBe(96);
    expect(entry.sceneInset).toBe(16);
    expect(entry.columns).toBe(6);
    expect(entry.actionSheetUrl).toContain("/baseball/red/action-sheet.png");
    expect(entry.overlaySheetUrl).toContain("/baseball/red/prop-sheet.png");
    expect(slimePropFrameOffset(0, entry, 1)).toEqual({ left: 0, top: 0 });
    expect(slimePropFrameOffset(5, entry, 1)).toEqual({ left: -480, top: 0 });
    expect(slimePropFrameOffset(6, entry, 1)).toEqual({ left: 0, top: -96 });
    expect(slimePropFrameOffset(5, entry, 2)).toEqual({ left: -960, top: 0 });
  });
});
