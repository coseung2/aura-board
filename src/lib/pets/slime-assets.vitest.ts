import { describe, expect, it } from "vitest";

import {
  EQUIPPED_FLOORS,
  SLIME_ACTIONS,
  SLIME_ASSET_COLORS,
  SLIME_EVOLUTIONS,
  getSlimeFrame,
  getSlimeFrameDuration,
  resolveSlimeAsset,
  resolveSlimeBallAsset,
  type EquippedFloor,
  type SlimeAction,
  type SlimeEvolution,
} from "./slime-assets";
import {
  SLIME_WEB_ASSET_REGISTRY,
  SLIME_WEB_CROWN_OVERLAY_REGISTRY,
  SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY,
} from "./slime-assets.generated";
import { SLIME_BALL_WEB_ASSET_REGISTRY } from "./slime-ball-assets.generated";

const state = (
  evolution: SlimeEvolution,
  slimeColor: (typeof SLIME_ASSET_COLORS)[number],
  action: SlimeAction,
  equippedFloor: EquippedFloor,
) => ({ evolution, slimeColor, action, equippedFloor });

describe("official slime asset resolver", () => {
  it("publishes a 12-frame heart-only happy overlay for every slime color", () => {
    expect(Object.keys(SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY)).toHaveLength(5);
    for (const slimeColor of SLIME_ASSET_COLORS) {
      const overlay = SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY[`base/${slimeColor}`];
      expect(overlay.key).toBe(`base/${slimeColor}`);
      expect(overlay.action).toBe("happy");
      expect(overlay.metadata.frames).toHaveLength(12);
      expect(overlay.metadata.meta.size).toEqual({ w: 768, h: 64 });
    }
  });
  it("covers every color, evolution, action, and floor state through the formula", () => {
    expect(Object.keys(SLIME_WEB_ASSET_REGISTRY)).toHaveLength(75);
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
            if (equippedFloor !== "none" && equippedFloor !== "water-puddle" && equippedFloor !== "trampoline") {
              expect(result.staticFloor).toMatchObject({ surfaceY: 44, slimeFootY: 56 });
            } else {
              expect(result.staticFloor).toBeNull();
            }

            const expectedAction = action === "floor-interaction"
              ? equippedFloor === "water-puddle" || equippedFloor === "trampoline" ? equippedFloor : "idle"
              : action;
            // Every action now has authored overlays, including the jump floors, so
            // the scene always composes and always draws the plain base sheet. A
            // baked evolved sheet is only reachable for an action with no overlay
            // at all, which no longer exists.
            const expectedMode = "composed";
            const expectedEvolution = "base";
            const expectedVariant = expectedAction === "drink"
              ? "drink-lemonade"
              : expectedAction;
            expect(result.key).toBe(`${expectedEvolution}/${slimeColor}/${expectedVariant}`);
            const loops = expectedAction === "idle" || expectedAction === "water-puddle" || expectedAction === "trampoline";
            expect(result.oneShot).toBe(!loops);
            expect(result.loop).toBe(loops);

            // Growth stage is inferred from the evolution here, so an evolved
            // slime always has its crown in the head slot.
            if (evolution === "base") {
              expect(result.headSlot).toBeNull();
            } else {
              expect(result.headSlot).toEqual({ option: evolution, source: "growth" });
            }
            expect(result.composition.mode).toBe(expectedMode);
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

    // Crowned jump sheets are no longer selected: jump wearables are authored as
    // overlays, so an evolved slime jumps on the same base sheet as any other.
    const crownedWater = resolveSlimeAsset(state("gold-crown-red-gem", "blue", "floor-interaction", "water-puddle"));
    const crownedTrampoline = resolveSlimeAsset(state("silver-crown-blue-gem", "blue", "floor-interaction", "trampoline"));
    expect(crownedWater.key).toBe("base/blue/water-puddle");
    expect(crownedWater.frameSize).toEqual({ x: 0, y: 0, w: 64, h: 64 });
    expect(crownedTrampoline.key).toBe("base/blue/trampoline");
    expect(crownedTrampoline.metadata.frames.every((frame) => frame.duration === 100)).toBe(true);
  });

  it("maps each canonical lemonade sheet to its color and evolution", () => {
    for (const evolution of SLIME_EVOLUTIONS) {
      for (const slimeColor of SLIME_ASSET_COLORS) {
        const key = `${evolution}/${slimeColor}/drink-lemonade` as keyof typeof SLIME_WEB_ASSET_REGISTRY;
        const entry = SLIME_WEB_ASSET_REGISTRY[key];
        expect(entry.sheetUrl).toBe(`/creatures/slimes/official/${key}/sheet.png`);
        expect(entry.color).toBe(slimeColor);
        expect(entry.evolution).toBe(evolution);
        expect(entry.action).toBe("drink-lemonade");

        if (evolution === "base") {
          expect(entry.metadata.meta).toMatchObject({
            action: "drink-lemonade",
            color: slimeColor,
          });
        } else {
          expect(entry.metadata.frames[0]?.filename).toContain(
            `slime-${slimeColor}-drink-lemonade-${evolution}`,
          );
        }
      }
    }
  });

  it("keeps drink as one semantic action while selecting the requested flavor sheet", () => {
    for (const drinkFlavor of [
      "lemonade",
      "strawberry-soda",
      "melon-soda",
      "grape-soda",
      "blue-ramune",
    ]) {
      const result = resolveSlimeAsset({
        ...state("gold-crown-red-gem", "blue", "drink", "none"),
        drinkFlavor,
      });
      expect(result.action).toBe("drink");
      expect(result.resolvedAction).toBe("drink");
      expect(result.resolvedVariant).toBe(`drink-${drinkFlavor}`);
      expect(result.drinkFlavor).toBe(drinkFlavor);
      expect(result.key).toBe(`base/blue/drink-${drinkFlavor}`);
    }

    const legacy = resolveSlimeAsset(state("base", "blue", "drink", "none"));
    expect(legacy.resolvedVariant).toBe("drink-lemonade");
    expect(legacy.drinkFlavor).toBe("lemonade");
  });

  it("keeps generated registries project-local and composes crowns on the base sheet", () => {
    const serialized = JSON.stringify({ SLIME_WEB_ASSET_REGISTRY, SLIME_WEB_CROWN_OVERLAY_REGISTRY });
    expect(serialized).not.toMatch(/SlimeAssets|[A-Za-z]:\\/i);

    const evolvedIdle = resolveSlimeAsset(state("silver-crown-blue-gem", "red", "idle", "none"));
    const evolvedHappy = resolveSlimeAsset(state("gold-crown-red-gem", "red", "happy", "none"));
    expect(evolvedIdle.key).toBe("base/red/idle");
    expect(evolvedHappy.key).toBe("base/red/happy");
    expect(evolvedIdle.renderedHeadwear).toBe("silver-crown-blue-gem");
    expect(evolvedHappy.renderedHeadwear).toBe("gold-crown-red-gem");
    expect(evolvedIdle.composition.mode).toBe("composed");
    expect(evolvedHappy.composition.mode).toBe("composed");
    expect(evolvedHappy.happyHeart).toMatchObject({
      key: "base/red",
      action: "happy",
      imageUrl: "/creatures/slimes/official/overlays/happy-heart/base/red/sheet.png",
    });
    expect(evolvedHappy.happyHeart?.metadata.frames).toHaveLength(12);
    expect(evolvedIdle.happyHeart).toBeNull();
  });

  it("gives a player-chosen hat priority over the growth crown", () => {
    const withHat = resolveSlimeAsset({
      ...state("gold-crown-red-gem", "red", "idle", "none"),
      equippedHeadwear: "straw-hat",
    });
    expect(withHat.headSlot).toEqual({ option: "straw-hat", source: "equipped" });
    expect(withHat.renderedHeadwear).toBe("straw-hat");
    expect(withHat.key).toBe("base/red/idle");

    // Removing the hat restores the growth crown without touching growth state.
    const withoutHat = resolveSlimeAsset({
      ...state("gold-crown-red-gem", "red", "idle", "none"),
      equippedHeadwear: null,
    });
    expect(withoutHat.renderedHeadwear).toBe("gold-crown-red-gem");
    expect(withoutHat.requestedEvolution).toBe("gold-crown-red-gem");
  });

  it("keeps a chosen hat on during jumps and never reveals the crown", () => {
    const jumping = resolveSlimeAsset({
      ...state("gold-crown-red-gem", "red", "floor-interaction", "trampoline"),
      equippedHeadwear: "straw-hat",
    });
    // Jump wearables are authored, so the hat stays on its own taller canvas.
    expect(jumping.composition).toEqual({ mode: "composed", headwear: "drawn" });
    expect(jumping.renderedHeadwear).toBe("straw-hat");
    expect(jumping.key).toBe("base/red/trampoline");

    // Without a hat the crown has no jump track, so the head is left bare rather
    // than falling back to a baked crowned sheet.
    const crownOnly = resolveSlimeAsset(
      state("gold-crown-red-gem", "red", "floor-interaction", "trampoline"),
    );
    expect(crownOnly.composition.headwear).toBe("suppressed");
    expect(crownOnly.renderedHeadwear).toBeNull();
    expect(crownOnly.key).toBe("base/red/trampoline");
  });

  it("resolves each ball slug to its matching colour animation and loops it", () => {
    expect(Object.keys(SLIME_BALL_WEB_ASSET_REGISTRY)).toHaveLength(35);
    const soccer = resolveSlimeBallAsset("purple", "soccer-ball");
    expect(soccer).toMatchObject({
      key: "soccer-ball/purple",
      ballSlug: "soccer-ball",
      slimeColor: "purple",
      sheetUrl: "/creatures/slimes/official/props/ball/soccer-ball/purple/slime-purple-soccer-ball-hit-sheet.png",
      gifUrl: "/creatures/slimes/official/props/ball/soccer-ball/purple/slime-purple-soccer-ball-hit.gif",
      frameCount: 18,
      frameSize: { x: 0, y: 0, w: 64, h: 64 },
      playback: { loop: true, oneShot: false },
      loop: true,
      oneShot: false,
    });
    expect(soccer.metadata.meta.size).toEqual({ w: 384, h: 192 });
    expect(soccer.metadata.frames.every((frame) => frame.duration > 0)).toBe(true);
    const withBall = resolveSlimeAsset(state("base", "purple", "idle", "none"), "soccer-ball");
    expect(withBall.ball?.key).toBe("soccer-ball/purple");
    expect(withBall.loop).toBe(true);
  });

});
