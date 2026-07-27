import { describe, expect, it } from "vitest";

import {
  SLIME_SHOP_TIER_LABEL_BY_PRICE,
  groupSlimeShopItemsByTier,
  groupSlimeOutfitsByRole,
  groupSlimePropsByKind,
  mobileSlimeActiveSets,
  shopFilterForItem,
} from "../../apps/mobile/lib/slimes";
import { SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import { SLIME_WEARABLE_SET_CATALOG } from "@/lib/pets/wearable-catalog";

describe("mobile set bonuses", () => {
  /** Spread a family's pieces across separate pets, one per slime. */
  const wornAcrossPets = (itemKeys: readonly string[]) => ({
    equippedItemsByColor: Object.fromEntries(
      itemKeys.map((key, index) => [`pet-${index}`, [key]]),
    ),
  });

  it("stays in step with the web set catalog", () => {
    // The mobile list is duplicated for the Expo bundle, so drift here would show
    // the player a bonus the server does not grant, or hide one it does.
    for (const set of SLIME_WEARABLE_SET_CATALOG) {
      const active = mobileSlimeActiveSets(wornAcrossPets(set.requiredItemKeys) as never);
      const match = active.find((item) => item.key === set.key);
      expect(match, set.key).toBeTruthy();
      expect(match.bps, set.key).toBe(set.effectBps);
      expect(match.effectKey, set.key).toBe(set.effectKey);
    }
  });

  it("needs every piece of a family", () => {
    const [set] = SLIME_WEARABLE_SET_CATALOG;
    const partial = set.requiredItemKeys.slice(0, set.requiredItemKeys.length - 1);
    expect(mobileSlimeActiveSets(wornAcrossPets(partial) as never)).toEqual([]);
  });

  it("completes a family spread over several pets, since one pet fills one slot", () => {
    // The beanie collection is four headwear pieces. A single slime can only wear
    // one hat, so the set is only reachable across separate pets.
    const set = SLIME_WEARABLE_SET_CATALOG.find((item) => item.key === "beanie-collection");
    expect(set.requiredItemKeys.length).toBe(4);

    const onOnePet = { equippedItemsByColor: { blue: [...set.requiredItemKeys] } };
    expect(mobileSlimeActiveSets(onOnePet as never).map((item) => item.key)).toContain(
      "beanie-collection",
    );

    const spread = wornAcrossPets(set.requiredItemKeys);
    expect(mobileSlimeActiveSets(spread as never).map((item) => item.key)).toContain(
      "beanie-collection",
    );
  });

  it("grants nothing for pieces owned but not worn", () => {
    const [set] = SLIME_WEARABLE_SET_CATALOG;
    // Owning without equipping must not activate a set.
    expect(mobileSlimeActiveSets({ ownedItemKeys: set.requiredItemKeys } as never)).toEqual([]);
  });

  it("tolerates a home without equipped data", () => {
    expect(mobileSlimeActiveSets({} as never)).toEqual([]);
    expect(mobileSlimeActiveSets({ equippedItemsByColor: {} } as never)).toEqual([]);
  });
});

describe("slime shop price bands", () => {
  it("orders bands cheapest first and labels them in order", () => {
    const groups = groupSlimeShopItemsByTier([
      { price: 1_000 },
      { price: 500 },
      { price: 700 },
    ]);
    expect(groups.map((group) => group.price)).toEqual([500, 700, 1_000]);
    expect(groups.map((group) => group.label)).toEqual(["기본", "고급", "최고급"]);
  });

  it("binds a label to its price, not to the band's position", () => {
    // The wizard hat is the only 1,000-won outfit. If labels followed position it
    // would read as "고급" here while the same price reads as "최고급" elsewhere.
    const groups = groupSlimeShopItemsByTier([{ price: 500 }, { price: 1_000 }]);
    expect(groups.map((group) => group.label)).toEqual(["기본", "최고급"]);
  });

  it("falls back to the amount for an unlabelled price", () => {
    const [group] = groupSlimeShopItemsByTier([{ price: 250 }, { price: 900 }]);
    expect(SLIME_SHOP_TIER_LABEL_BY_PRICE[250]).toBeUndefined();
    expect(group.label).toBe("250원");
  });

  it("returns one unlabelled group when a category is priced uniformly", () => {
    const groups = groupSlimeShopItemsByTier([{ price: 500 }, { price: 500 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].items).toHaveLength(2);
  });

  it("returns nothing for an empty list", () => {
    expect(groupSlimeShopItemsByTier([])).toEqual([]);
  });

  it("puts free items in the cheapest band rather than a band of their own", () => {
    const groups = groupSlimeShopItemsByTier([
      { price: 0, id: "free" },
      { price: 500, id: "cheap" },
      { price: 1_000, id: "dear" },
    ]);
    expect(groups.map((group) => group.price)).toEqual([500, 1_000]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["free", "cheap"]);
  });

  it("preserves catalog order inside a band", () => {
    const items = [{ price: 500, id: "a" }, { price: 1_000, id: "b" }, { price: 500, id: "c" }];
    const [entry] = groupSlimeShopItemsByTier(items);
    expect(entry.items.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("bands every real shop category without losing an item", () => {
    const filters = ["background", "floor", "outfit", "prop", "food"] as const;
    for (const filter of filters) {
      const items = SLIME_SHOP_CATALOG.filter((item) => shopFilterForItem(item) === filter);
      if (items.length === 0) continue;
      const groups = groupSlimeShopItemsByTier(items);
      const total = groups.reduce((sum, group) => sum + group.items.length, 0);
      expect(total, filter).toBe(items.length);
      // Bands ascend, so the list reads from entry tier down to premium tier.
      const prices = groups.map((group) => group.price);
      expect([...prices].sort((a, b) => a - b), filter).toEqual(prices);
    }
  });
});

describe("outfit sub-categories", () => {
  const outfits = SLIME_SHOP_CATALOG.filter((item) => shopFilterForItem(item) === "outfit");

  it("splits outfits into slot groups in display order", () => {
    const groups = groupSlimeOutfitsByRole(outfits);
    expect(groups.map((group) => group.role)).toEqual(["headwear", "eyewear", "blush"]);
    expect(groups.map((group) => group.label)).toEqual(["모자", "안경", "볼터치"]);
  });

  it("loses no outfit to grouping", () => {
    const groups = groupSlimeOutfitsByRole(outfits);
    const total = groups.reduce((sum, group) => sum + group.items.length, 0);
    expect(total).toBe(outfits.length);
  });

  it("bands each slot independently so a slot's own prices decide its labels", () => {
    const groups = groupSlimeOutfitsByRole(outfits);
    const headwear = groups.find((group) => group.role === "headwear");
    const tiers = groupSlimeShopItemsByTier(headwear.items);
    // Bands come from the prices the slot actually contains, so adding a new
    // headwear price point changes this without a code change. What must hold is
    // that bands ascend and each label matches its own price.
    expect(tiers.length).toBeGreaterThan(1);
    const prices = tiers.map((tier) => tier.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    for (const tier of tiers) {
      expect(tier.label, `${tier.price}`).toBe(SLIME_SHOP_TIER_LABEL_BY_PRICE[tier.price]);
    }
  });

  it("keeps an unknown slot visible instead of dropping it", () => {
    const groups = groupSlimeOutfitsByRole([
      { wearableRole: "headwear" as const, price: 500 },
      { wearableRole: null, price: 500 },
    ]);
    const total = groups.reduce((sum, group) => sum + group.items.length, 0);
    expect(total).toBe(2);
  });
});

describe("prop sub-categories", () => {
  const props = SLIME_SHOP_CATALOG.filter((item) => shopFilterForItem(item) === "prop");

  it("splits props into drink, ride, and ball groups", () => {
    const groups = groupSlimePropsByKind(props);
    expect(groups.map((group) => group.key)).toEqual(["drink", "ride", "ball"]);
    expect(groups.map((group) => group.label)).toEqual(["음료", "탈것", "공"]);
  });

  it("loses no prop to grouping", () => {
    const total = groupSlimePropsByKind(props).reduce(
      (sum, group) => sum + group.items.length,
      0,
    );
    expect(total).toBe(props.length);
  });

  it("files the trampoline under props rather than floors", () => {
    // It carries a floor value because the slime lands on it, but it is a thing to
    // play on rather than ground to stand on.
    const trampoline = SLIME_SHOP_CATALOG.find((item) => item.category === "ride");
    expect(trampoline).toBeTruthy();
    expect(trampoline.floor).toBe("trampoline");
    expect(shopFilterForItem(trampoline)).toBe("prop");

    const rides = groupSlimePropsByKind(props).find((group) => group.key === "ride");
    expect(rides.items.map((item) => item.key)).toContain(trampoline.key);
  });

  it("keeps real floors in the floor tab", () => {
    const floors = SLIME_SHOP_CATALOG.filter((item) => shopFilterForItem(item) === "floor");
    expect(floors.length).toBeGreaterThan(1);
    expect(floors.some((item) => item.category === "ride")).toBe(false);
  });
});

describe("drink previews", () => {
  const drinks = SLIME_SHOP_CATALOG.filter((item) => item.category === "drink");

  it("never previews a drink on a slime of its own colour", () => {
    // A yellow lemonade on a yellow slime loses the contrast that makes the drink
    // readable, and blue ramune additionally drops highlight pixels on blue.
    const ownColour: Record<string, string> = {
      lemonade: "yellow",
      "strawberry-soda": "red",
      "melon-soda": "green",
      "grape-soda": "purple",
      "blue-ramune": "blue",
    };
    for (const drink of drinks) {
      const clash = ownColour[drink.animationKey ?? ""];
      expect(drink.previewColor, drink.key).toBeTruthy();
      expect(drink.previewColor, drink.key).not.toBe(clash);
    }
  });

  it("gives every drink a distinct preview slime", () => {
    const colours = drinks.map((drink) => drink.previewColor);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it("varies the ball previews instead of repeating one slime", () => {
    const balls = SLIME_SHOP_CATALOG.filter((item) => item.key.startsWith("slime-ball-"));
    expect(balls.length).toBeGreaterThan(1);
    for (const ball of balls) expect(ball.previewColor, ball.key).toBeTruthy();
    // Adjacent balls must differ, which is what stops the grid reading as one
    // repeated blob even though there are more balls than slime colours.
    for (let index = 1; index < balls.length; index += 1) {
      expect(balls[index].previewColor, balls[index].key).not.toBe(balls[index - 1].previewColor);
    }
  });
});

describe("background names", () => {
  it("uses the renamed shop labels", () => {
    const byKey = new Map(SLIME_SHOP_CATALOG.map((item) => [item.key, item.labelKo]));
    const expected: Record<string, string> = {
      "aurora-dream-sky-background": "오로라의 꿈",
      "dreamy-toy-room-background": "꿈꾸는 장난감",
      "enchanted-forest-canopy-background": "숲속의 마법",
      "four-season-sky-background": "포시즌스",
      "jellyfish-ocean-background": "해파리 유영",
      "cherry-cloud-ume-background": "봄날의 구름",
      "lavender-butterfly-sky-background": "라벤더 나비",
      "meteor-festival-sky-background": "유성우",
      "midnight-snow-cloud-background": "눈 내리는 밤",
      "neon-space-station-background": "우주정거장",
      "rainy-window-cafe-background": "비 오는 날",
      "sunset-lantern-sky-background": "노을 등불",
      "tropical-fish-ocean-background": "열대어 파티",
    };
    for (const [key, label] of Object.entries(expected)) {
      expect(byKey.get(key), key).toBe(label);
    }
  });
});
