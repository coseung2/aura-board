import type { SlimeShopItem } from "./types";

export const MOBILE_REMOTE_WEARABLE_CAPABILITY = "slime-wearable-assets-v1";

/**
 * Wearables approved after the last APK that only knew Metro-bundled overlays.
 * A legacy bearer client can understand the item metadata but cannot draw these
 * options, so serving them creates an empty slime preview and a broken purchase.
 */
export const LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS = new Set<string>([
  "slime-headwear-lilac-origami-crane-fascinator",
  "slime-headwear-sprout-terrarium-dome-hat",
  "slime-eyewear-prism-kaleidoscope-glasses",
  "slime-eyewear-crescent-moon-half-rim-glasses",
]);

export function mobileClientSupportsRemoteWearables(
  capabilityHeader: string | null,
): boolean {
  return (capabilityHeader ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(MOBILE_REMOTE_WEARABLE_CAPABILITY);
}

export type MobileWearableCompatibilityOptions = {
  bearerClient: boolean;
  capabilityHeader: string | null;
};

export function needsLegacyMobileWearableFiltering(
  options: MobileWearableCompatibilityOptions,
): boolean {
  return (
    options.bearerClient &&
    !mobileClientSupportsRemoteWearables(options.capabilityHeader)
  );
}

export function wearableKeysForMobileClient(
  keys: readonly string[],
  options: MobileWearableCompatibilityOptions,
): readonly string[] {
  if (!needsLegacyMobileWearableFiltering(options)) return keys;
  return keys.filter(
    (key) => !LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS.has(key),
  );
}

export function shopCatalogForMobileClient(
  catalog: readonly SlimeShopItem[],
  options: MobileWearableCompatibilityOptions,
): readonly SlimeShopItem[] {
  if (!needsLegacyMobileWearableFiltering(options)) return catalog;
  return catalog.filter(
    (item) => !LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS.has(item.key),
  );
}

type SlimeHomeCompatibilityShape = {
  shopCatalog: readonly SlimeShopItem[];
  ownedItemKeys: readonly string[];
  ownedItemQuantities: Readonly<Record<string, number>>;
  equippedItemKeys: readonly string[];
  equippedItemsByColor: Readonly<Record<string, readonly string[] | undefined>>;
  hiddenItemKeys: readonly string[];
  hiddenItemsByColor: Readonly<Record<string, readonly string[] | undefined>>;
};

function itemQuantitiesForLegacyMobile(
  quantities: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(quantities).filter(
      ([key]) => !LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS.has(key),
    ),
  );
}

function itemKeysByColorForLegacyMobile(
  values: Readonly<Record<string, readonly string[] | undefined>>,
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(values).map(([color, keys]) => [
      color,
      (keys ?? []).filter(
        (key) => !LEGACY_MOBILE_UNSUPPORTED_WEARABLE_KEYS.has(key),
      ),
    ]),
  );
}

/**
 * Keep old APKs from receiving inventory/equipment references they cannot draw.
 * Persistence is untouched; a capable app immediately sees the original state.
 */
export function slimeHomeForMobileClient<T extends SlimeHomeCompatibilityShape>(
  home: T,
  options: MobileWearableCompatibilityOptions,
): T {
  if (!needsLegacyMobileWearableFiltering(options)) return home;
  return {
    ...home,
    shopCatalog: shopCatalogForMobileClient(home.shopCatalog, options),
    ownedItemKeys: wearableKeysForMobileClient(home.ownedItemKeys, options),
    ownedItemQuantities: itemQuantitiesForLegacyMobile(home.ownedItemQuantities),
    equippedItemKeys: wearableKeysForMobileClient(home.equippedItemKeys, options),
    equippedItemsByColor: itemKeysByColorForLegacyMobile(home.equippedItemsByColor),
    hiddenItemKeys: wearableKeysForMobileClient(home.hiddenItemKeys, options),
    hiddenItemsByColor: itemKeysByColorForLegacyMobile(home.hiddenItemsByColor),
  } as T;
}
