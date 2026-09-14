import { describe, expect, it } from "vitest";
import { SLIME_SHOP_CATALOG } from "./catalog-shop";
import {
  characterOnlySlimeItemKeys,
  isCharacterOnlySlimeItemKey,
} from "./character-only-items";

function firstKeyWhere(predicate: (item: (typeof SLIME_SHOP_CATALOG)[number]) => boolean) {
  const item = SLIME_SHOP_CATALOG.find(predicate);
  if (!item) throw new Error("catalog fixture missing a required item category");
  return item.key;
}

describe("characterOnlySlimeItemKeys", () => {
  it("keeps worn items and drops scene furniture", () => {
    const wearable = firstKeyWhere((item) => item.category === "wearable");
    const background = firstKeyWhere((item) => item.category === "background" && !item.floor);
    const vehicle = firstKeyWhere((item) => item.category === "vehicle");
    const floor = firstKeyWhere((item) => Boolean(item.floor));

    expect(characterOnlySlimeItemKeys([wearable, background, vehicle, floor])).toEqual([
      wearable,
    ]);
  });

  it("never keeps an item that declares a floor", () => {
    const floorKeys = SLIME_SHOP_CATALOG.filter((item) => item.floor).map((item) => item.key);

    expect(floorKeys.length).toBeGreaterThan(0);
    expect(characterOnlySlimeItemKeys(floorKeys)).toEqual([]);
  });

  it("ignores keys that are not in the catalog", () => {
    expect(isCharacterOnlySlimeItemKey("not-a-real-item")).toBe(false);
    expect(characterOnlySlimeItemKeys(["not-a-real-item"])).toEqual([]);
  });

  it("preserves the caller's ordering", () => {
    const wearables = SLIME_SHOP_CATALOG.filter((item) => item.category === "wearable")
      .slice(0, 3)
      .map((item) => item.key);

    expect(characterOnlySlimeItemKeys([...wearables].reverse())).toEqual(
      [...wearables].reverse(),
    );
  });
});
