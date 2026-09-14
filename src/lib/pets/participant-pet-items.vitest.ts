import { expect, it } from "vitest";
import { SLIME_SHOP_CATALOG } from "./catalog-shop";
import { participantPetItemKeys } from "./participant-pet-items";

it("retains real equipped vehicles and wearables, respecting hidden keys and removing scenery", () => {
  const vehicle = SLIME_SHOP_CATALOG.find((item) => item.category === "vehicle")!;
  const wearable = SLIME_SHOP_CATALOG.find((item) => item.category === "wearable")!;
  const scenery = SLIME_SHOP_CATALOG.filter((item) => item.floor || item.category === "background").map((item) => item.key);
  const equipped = [vehicle.key, wearable.key, ...scenery, "unknown-key"];
  expect(participantPetItemKeys(equipped, [])).toEqual([vehicle.key, wearable.key]);
  expect(participantPetItemKeys(equipped, [vehicle.key])).toEqual([wearable.key]);
  expect(equipped).toContain(vehicle.key);
});
