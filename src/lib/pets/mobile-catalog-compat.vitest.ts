import { describe, expect, it } from "vitest";
import {
  LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS,
  MOBILE_REMOTE_WEARABLE_CAPABILITY,
  mobileClientSupportsRemoteWearables,
  shopCatalogForMobileClient,
  slimeHomeForMobileClient,
} from "./mobile-catalog-compat";
import type { SlimeShopItem } from "./types";

function item(key: string): SlimeShopItem {
  return {
    key,
    category: "wearable",
    floor: null,
    labelKo: key,
    price: 1_000,
    spritePath: "/wearable.png",
  };
}

describe("mobile slime catalog compatibility", () => {
  const legacyOnlyKey = [...LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS][0]!;
  const catalog = [item("slime-headwear-straw-hat"), item(legacyOnlyKey)];

  it("recognizes the remote wearable capability among comma-separated values", () => {
    expect(
      mobileClientSupportsRemoteWearables(
        `other-v1, ${MOBILE_REMOTE_WEARABLE_CAPABILITY}`,
      ),
    ).toBe(true);
  });

  it("hides unsupported late wearables only from legacy bearer clients", () => {
    expect(
      shopCatalogForMobileClient(catalog, {
        bearerClient: true,
        capabilityHeader: null,
      }).map(({ key }) => key),
    ).toEqual(["slime-headwear-straw-hat"]);

    expect(
      shopCatalogForMobileClient(catalog, {
        bearerClient: true,
        capabilityHeader: MOBILE_REMOTE_WEARABLE_CAPABILITY,
      }),
    ).toBe(catalog);

    expect(
      shopCatalogForMobileClient(catalog, {
        bearerClient: false,
        capabilityHeader: null,
      }),
    ).toBe(catalog);
  });

  it("removes unsupported references from legacy inventory and equipment snapshots", () => {
    const supportedKey = "slime-headwear-straw-hat";
    const home = {
      shopCatalog: catalog,
      ownedItemKeys: [supportedKey, legacyOnlyKey],
      ownedItemQuantities: { [supportedKey]: 1, [legacyOnlyKey]: 2 },
      equippedItemKeys: [legacyOnlyKey],
      equippedItemsByColor: { blue: [legacyOnlyKey] },
      hiddenItemKeys: [legacyOnlyKey],
      hiddenItemsByColor: { blue: [legacyOnlyKey] },
      untouched: "value",
    };

    expect(
      slimeHomeForMobileClient(home, {
        bearerClient: true,
        capabilityHeader: null,
      }),
    ).toEqual({
      shopCatalog: [catalog[0]],
      ownedItemKeys: [supportedKey],
      ownedItemQuantities: { [supportedKey]: 1 },
      equippedItemKeys: [],
      equippedItemsByColor: { blue: [] },
      hiddenItemKeys: [],
      hiddenItemsByColor: { blue: [] },
      untouched: "value",
    });
  });
});
