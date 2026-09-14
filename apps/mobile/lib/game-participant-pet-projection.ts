import { SLIME_SHOP_CATALOG } from "../../../src/lib/pets/catalog-shop";
import { resolveEquippedSlimeWearables, resolveEquippedVehicle, type SlimeShopItem } from "./slime-catalog";
import { visibleEquippedSlimeItemKeys } from "./slime-item-visibility";
import type { GameParticipantPetData } from "./game-participant-pet";

// Client-safe catalog data; ownership always comes from the student's API projection.
const catalog: readonly SlimeShopItem[] = SLIME_SHOP_CATALOG;

export function projectGameParticipantPet(pet: GameParticipantPetData) {
  const visibleKeys = visibleEquippedSlimeItemKeys(pet.equippedItemKeys ?? [], pet.hiddenItemKeys);
  const items = visibleKeys.flatMap((key) => {
    const item = catalog.find((candidate) => candidate.key === key);
    return item && item.category !== "background" && !item.floor ? [item] : [];
  });
  const keys = items.map((item) => item.key);
  return {
    items,
    keys,
    wearables: resolveEquippedSlimeWearables(keys, items),
    vehicle: resolveEquippedVehicle(keys, items),
    food: items.find((item) => item.category === "food"),
  };
}
