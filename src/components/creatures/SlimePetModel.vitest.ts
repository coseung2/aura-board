import { describe, expect, it } from "vitest";

import { SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";

import {
  shopFilterForItem,
  slimeWearablesFromItems,
} from "./SlimePetModel";

describe("slime shop model", () => {
  it("routes props and wearables to their top-level shop filters", () => {
    const ball = SLIME_SHOP_CATALOG.find((item) => item.key.startsWith("slime-ball-"));
    const drink = SLIME_SHOP_CATALOG.find((item) => item.category === "drink");
    const wearable = SLIME_SHOP_CATALOG.find((item) => item.category === "wearable");

    expect(ball).toBeTruthy();
    expect(drink).toBeTruthy();
    expect(wearable).toBeTruthy();
    expect(shopFilterForItem(ball!)).toBe("prop");
    expect(shopFilterForItem(drink!)).toBe("prop");
    expect(shopFilterForItem(wearable!)).toBe("outfit");
  });

  it("resolves one independent selection per wearable role with the drink flavor", () => {
    const blushItems = SLIME_SHOP_CATALOG.filter((item) => item.wearableRole === "blush");
    const blush = blushItems[0];
    const replacementBlush = blushItems[1];
    const eyewear = SLIME_SHOP_CATALOG.find((item) => item.wearableRole === "eyewear");
    const headwear = SLIME_SHOP_CATALOG.find((item) => item.wearableRole === "headwear");
    const drink = SLIME_SHOP_CATALOG.find(
      (item) => item.category === "drink" && item.animationKey === "lemonade",
    );

    expect(blush).toBeTruthy();
    expect(replacementBlush).toBeTruthy();
    expect(eyewear).toBeTruthy();
    expect(headwear).toBeTruthy();
    expect(drink).toBeTruthy();

    const selection = slimeWearablesFromItems([
      blush!,
      eyewear!,
      headwear!,
      drink!,
      replacementBlush!,
    ]);

    expect(selection).toEqual({
      blush: replacementBlush!.wearableOption,
      eyewear: eyewear!.wearableOption,
      headwear: headwear!.wearableOption,
      drink: "lemonade",
    });
  });
});
