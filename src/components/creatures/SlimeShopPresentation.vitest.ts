import { describe, expect, it } from "vitest";

import type { SlimeShopItem } from "@/lib/pets/types";

import {
  slimeBuffChipTier,
  slimeShopItemBuffLabel,
  slimeShopPreviewState,
  slimeWardrobeItemWearerLabel,
} from "./SlimeShopPresentation";

const baseItem: SlimeShopItem = {
  key: "reading-glasses",
  labelKo: "독서 안경",
  category: "wearable",
  floor: null,
  price: 700,
  spritePath: "/reading-glasses.png",
  wearableRole: "eyewear",
  wearableOption: "reading-glasses",
  effectKey: "reading_reward",
  effectBps: 200,
};

describe("slime shop presentation", () => {
  it("formats compact buff labels and tiers", () => {
    expect(slimeShopItemBuffLabel(baseItem)).toBe("독서 +2%");
    expect(slimeBuffChipTier(100)).toBe("bronze");
    expect(slimeBuffChipTier(200)).toBe("silver");
    expect(slimeBuffChipTier(300)).toBe("gold");
  });

  it("resolves composed preview actions without replacing the sprite", () => {
    expect(
      slimeShopPreviewState({ ...baseItem, category: "drink" }),
    ).toEqual({ action: "drink", equippedFloor: "none" });
    expect(
      slimeShopPreviewState({
        ...baseItem,
        key: "slime-blue-trampoline",
        category: "ride",
        floor: "trampoline",
      }),
    ).toEqual({ action: "floor-interaction", equippedFloor: "trampoline" });
  });

  it("labels the other pet currently wearing an item", () => {
    expect(
      slimeWardrobeItemWearerLabel(
        baseItem.key,
        "blue",
        { green: [baseItem.key] },
      ),
    ).toBe("그린");
  });
});
