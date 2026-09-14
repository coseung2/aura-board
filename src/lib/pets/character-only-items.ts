import { getSlimeShopItem } from "./catalog";
import type { SlimeShopCategory } from "./types";

/**
 * Shop categories that render on the character itself.
 *
 * Waiting-room and scoreboard avatars show the student's pet, not the scene it
 * lives in. Backgrounds, floors ("ride" surfaces) and vehicles are deliberately
 * excluded: they are scene furniture, they dwarf a 44px avatar, and a vehicle
 * additionally shifts the character upward via `vehicleRiseY`, which breaks
 * alignment in a compact row.
 */
const CHARACTER_ONLY_CATEGORIES: readonly SlimeShopCategory[] = [
  "wearable",
  "drink",
  "food",
  "prop",
];

const characterOnlyCategories = new Set<SlimeShopCategory>(CHARACTER_ONLY_CATEGORIES);

/** True when the item draws on the character rather than the surrounding scene. */
export function isCharacterOnlySlimeItemKey(itemKey: string): boolean {
  const item = getSlimeShopItem(itemKey);
  if (!item) return false;
  // A floor is scene furniture even when its category says otherwise.
  if (item.floor) return false;
  return characterOnlyCategories.has(item.category);
}

/**
 * Keep only the equipped items that belong on the character.
 *
 * Callers must pass keys that are already filtered for per-student visibility
 * via `visibleEquippedSlimeItemKeys`. Buff and set calculations must keep using
 * the unfiltered equipped keys; this projection is for sprite composition only.
 */
export function characterOnlySlimeItemKeys(
  equippedItemKeys: readonly string[],
): string[] {
  return equippedItemKeys.filter(isCharacterOnlySlimeItemKey);
}
