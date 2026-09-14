import { getSlimeShopItem, isSlimeSceneBackground } from "./catalog";
import { visibleEquippedSlimeItemKeys } from "./item-visibility";

/** Identity scenes keep visible equipment and vehicles, but no room scenery. */
export function participantPetItemKeys(equipped: readonly string[], hidden: readonly string[]): string[] {
  return visibleEquippedSlimeItemKeys(equipped, hidden).filter((key) => {
    const item = getSlimeShopItem(key);
    return item && !item.floor && !isSlimeSceneBackground(item)
      && ["wearable", "drink", "food", "prop", "vehicle", "ride"].includes(item.category);
  });
}
