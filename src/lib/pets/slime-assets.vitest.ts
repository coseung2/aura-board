import { describe, expect, it } from "vitest";

import {
  EQUIPPED_FLOORS,
  SLIME_ACTIONS,
  SLIME_ASSET_COLORS,
  SLIME_EVOLUTIONS,
  getSlimeFrame,
  getSlimeFrameDuration,
  resolveSlimeAsset,
  type EquippedFloor,
  type SlimeAction,
  type SlimeEvolution,
} from "./slime-assets";
import {
  SLIME_WEB_ASSET_REGISTRY,
  SLIME_WEB_CROWN_OVERLAY_REGISTRY,
} from "./slime-assets.generated";

const state = (
  evolution: SlimeEvolution,
  slimeColor: (typeof SLIME_ASSET_COLORS)[number],
  action: SlimeAction,
  equippedFloor: EquippedFloor,
) => ({ evolution, slimeColor, action, equippedFloor });

describe("official slime asset resolver", () => {
  it("covers every color, evolution, action, and floor state through the formula", () => {
    expect(Object.keys(SLIME_WEB_ASSET_REGISTRY)).toHaveLength(55);
    expect(Object.keys(SLIME_WEB_CROWN_OVERLAY_REGISTRY)).toHaveLength(10);

    for (const slimeColor of SLIME_ASSET_COLORS) {
      for (const evolution of SLIME_EVOLUTIONS) {
        for (const action of SLIME_ACTIONS) {
          for (const equippedFloor of EQUIPPED_FLOORS) {
            const result = resolveSlimeAsset(state(evolution, slimeColor, action, equippedFloor));
            expect(result.slimeColor).toBe(slimeColor);
            expect(result.requestedEvolution).toBe(evolution);
            expect(result.equippedFloor).toBe(equippedFloor);
            expect(result.metadata.frames.length).toBeGreaterThan(0);
            if (equippedFloor === "grass-floor") {
              expect(result.staticFloor).toMatchObject({ surfaceY: 44, slimeFootY: 56 });
            } else {
              expect(result.staticFloor).toBeNull();
            }

            const expectedAction = action === "floor-interaction"
              ? equippedFloor === "water-puddle" || equippedFloor === "trampoline" ? equippedFloor : "idle"
              : action;
            const evolvedIdleOrHappy = evolution !== "base" && (expectedAction === "idle" || expectedAction === "happy");
            const expectedEvolution = evolvedIdleOrHappy ? "base" : evolution;
            expect(result.key).toBe(`${expectedEvolution}/${slimeColor}/${expectedAction}`);
            const loops = expectedAction === "idle" || expectedAction === "water-puddle" || expectedAction === "trampoline";
            expect(result.oneShot).toBe(!loops);
            expect(result.loop).toBe(loops);
            if (evolvedIdleOrHappy) expect(result.crownOverlay).not.toBeNull();
          }
        }
      }
    }
  });

  it("preserves exact drink and floor metadata, including crowned 64x75 frames", () => {
    const drink = resolveSlimeAsset(state("base", "blue", "drink", "none"));
    expect(drink.metadata.meta.size).toEqual({ w: 512, h: 64 });
    expect(drink.metadata.frames.map((frame) => frame.duration)).toEqual([220, 160, 180, 140, 140, 160, 180, 280]);
    expect(getSlimeFrameDuration(drink, 8)).toBe(220);
    expect(getSlimeFrame(drink, -1).frame).toEqual({ x: 448, y: 0, w: 64, h: 64 });

    const baseWater = resolveSlimeAsset(state("base", "blue", "floor-interaction", "water-puddle"));
    const baseTrampoline = resolveSlimeAsset(state("base", "blue", "floor-interaction", "trampoline"));
    expect(baseWater.metadata.meta.size).toEqual({ w: 832, h: 128 });
    expect(baseWater.frameSize).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    expect(baseTrampoline.metadata.meta.size).toEqual({ w: 832, h: 128 });
    expect(baseTrampoline.metadata.frames.every((frame) => frame.duration === 100)).toBe(true);
    expect(baseWater.metadata.frames[13]?.frame).toEqual({ x: 0, y: 64, w: 64, h: 64 });

    const crownedWater = resolveSlimeAsset(state("gold-crown-red-gem", "blue", "floor-interaction", "water-puddle"));
    const crownedTrampoline = resolveSlimeAsset(state("silver-crown-blue-gem", "blue", "floor-interaction", "trampoline"));
    expect(crownedWater.frameSize).toEqual({ x: 0, y: 0, w: 64, h: 75 });
    expect(crownedWater.metadata.meta.size).toEqual({ w: 1664, h: 75 });
    expect(crownedTrampoline.frameSize).toEqual({ x: 0, y: 0, w: 64, h: 75 });
    expect(crownedTrampoline.metadata.frames.every((frame) => frame.duration === 100)).toBe(true);
  });

  it("maps each canonical lemonade sheet to its color and evolution", () => {
    for (const evolution of SLIME_EVOLUTIONS) {
      for (const slimeColor of SLIME_ASSET_COLORS) {
        const key = `${evolution}/${slimeColor}/drink` as keyof typeof SLIME_WEB_ASSET_REGISTRY;
        const entry = SLIME_WEB_ASSET_REGISTRY[key];
        expect(entry.sheetUrl).toBe(`/creatures/slimes/official/${key}/sheet.png`);
        expect(entry.color).toBe(slimeColor);
        expect(entry.evolution).toBe(evolution);
        expect(entry.action).toBe("drink");

        const evolutionSuffix = evolution === "base" ? "" : `-${evolution}`;
        expect(entry.metadata.frames[0]?.filename).toContain(
          `slime-${slimeColor}-drink-lemonade${evolutionSuffix}`,
        );
      }
    }
  });

  it("keeps generated registries project-local and composes crown overlays for evolved idle/happy", () => {
    const serialized = JSON.stringify({ SLIME_WEB_ASSET_REGISTRY, SLIME_WEB_CROWN_OVERLAY_REGISTRY });
    expect(serialized).not.toMatch(/SlimeAssets|[A-Za-z]:\\/i);

    const evolvedIdle = resolveSlimeAsset(state("silver-crown-blue-gem", "red", "idle", "none"));
    const evolvedHappy = resolveSlimeAsset(state("gold-crown-red-gem", "red", "happy", "none"));
    expect(evolvedIdle.key).toBe("base/red/idle");
    expect(evolvedHappy.key).toBe("base/red/happy");
    expect(evolvedIdle.crownOverlay?.key).toBe("silver-crown-blue-gem/red");
    expect(evolvedHappy.crownOverlay?.key).toBe("gold-crown-red-gem/red");
    expect(evolvedIdle.crownOverlay?.differingPixels).toBeGreaterThan(0);
    expect(evolvedHappy.crownOverlay?.differingPixels).toBeGreaterThan(0);
  });

});
