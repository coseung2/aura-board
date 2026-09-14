import { describe, expect, it } from "vitest";
import { containPetScene, type GameParticipantPetSize } from "./game-participant-pet";
import { projectGameParticipantPet } from "./game-participant-pet-projection";
import { SLIME_SHOP_CATALOG } from "../../../src/lib/pets/catalog-shop";

describe("participant pet projection", () => {
  it("keeps visible vehicles, wearables, drinks, food and props without mutating hidden equipment", () => {
    const equippedItemKeys = SLIME_SHOP_CATALOG.map((item) => item.key);
    const hiddenItemKeys = SLIME_SHOP_CATALOG.filter((item) => item.category === "wearable").slice(0, 1).map((item) => item.key);
    const pet = { color: "purple", growthStage: 3 as const, equippedItemKeys, hiddenItemKeys };
    const before = JSON.stringify(pet);
    const projection = projectGameParticipantPet(pet);
    for (const category of ["vehicle", "wearable", "drink", "food", "prop"]) {
      expect(projection.items.some((item) => item.category === category)).toBe(true);
    }
    expect(projection.items.every((item) => item.category !== "background" && !item.floor)).toBe(true);
    expect(projection.keys).not.toContain(hiddenItemKeys[0]);
    expect(JSON.stringify(pet)).toBe(before);
  });

  it("does not invent equipment when optional fields are absent", () => {
    expect(projectGameParticipantPet({ color: "blue", growthStage: 1 }).keys).toEqual([]);
  });

  it("hides equipped vehicles and keeps their rendering metadata when visible", () => {
    const vehicle = SLIME_SHOP_CATALOG.find((item) => item.vehicleCanvasHeight && item.vehicleEffectSpritePaths?.length)!;
    expect(vehicle).toBeDefined();
    const pet = { color: "blue", growthStage: 2 as const, equippedItemKeys: [vehicle.key] };
    expect(projectGameParticipantPet(pet).vehicle).toEqual(vehicle);
    expect(projectGameParticipantPet({ ...pet, hiddenItemKeys: [vehicle.key] }).vehicle).toBeNull();
  });
});

describe("actual scene containment", () => {
  it.each<GameParticipantPetSize>([40, 44, 48, 56, 64, 96])("fits all layer edges with padding at %s", (size) => {
    const layers = [
      { left: 0, top: 0, width: 384, height: 384 },
      { left: -45, top: -270, width: 448, height: 640 },
      { left: 32, top: -310, width: 256, height: 256 },
      { left: -75, top: -180, width: 580, height: 512 },
    ];
    const fit = containPetScene(layers, size);
    const padding = size / 12;
    for (const layer of layers) {
      const left = (size - fit.width * fit.scale) / 2 + (layer.left - fit.left) * fit.scale;
      const top = (size - fit.height * fit.scale) / 2 + (layer.top - fit.top) * fit.scale;
      expect(left).toBeGreaterThanOrEqual(padding - 1e-8);
      expect(top).toBeGreaterThanOrEqual(padding - 1e-8);
      expect(left + layer.width * fit.scale).toBeLessThanOrEqual(size - padding + 1e-8);
      expect(top + layer.height * fit.scale).toBeLessThanOrEqual(size - padding + 1e-8);
    }
  });
});
