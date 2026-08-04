import { describe, expect, it } from "vitest";

import {
  SLIME_FLOOR_SCALE,
  SLIME_HOME_HERO_RENDERER_SCALE,
  SLIME_SCENE_SCALE,
  fitSlimeRendererScale,
  normalizeSlimeRendererScale,
  resolveSlimeSpriteGeometry,
  slimeFrameOffset,
  studentHomeHeroRendererScale,
} from "./slime-sprite-geometry";

describe("slime-sprite-geometry", () => {
  it("keeps renderer scale on positive integers", () => {
    expect(normalizeSlimeRendererScale(undefined)).toBe(1);
    expect(normalizeSlimeRendererScale(2.4)).toBe(2);
    expect(normalizeSlimeRendererScale(0)).toBe(1);
    expect(studentHomeHeroRendererScale(true)).toBe(SLIME_HOME_HERO_RENDERER_SCALE);
  });

  it("selects the largest integer scale that fits a host without fractional stretch", () => {
    // Desktop 192 host with expanded 96 logical scene => exact 2x, not CSS stretch of 1x.
    expect(fitSlimeRendererScale(96, 192)).toBe(2);
    expect(fitSlimeRendererScale(96, 240)).toBe(2);
    expect(fitSlimeRendererScale(96, 208)).toBe(2);
    expect(fitSlimeRendererScale(96, 144)).toBe(1);
    expect(fitSlimeRendererScale(64, 160)).toBe(2);
    expect(fitSlimeRendererScale(64, 390)).toBe(6);
  });

  it("matches the mobile expanded scene and vehicle offset contract", () => {
    const { geometry, viewportHeight } = resolveSlimeSpriteGeometry({
      sourceWidth: 64,
      sourceHeight: 64,
      rendererScale: 1,
      expandedScene: true,
      vehicleRiseY: 14,
      vehicleBobY: -1,
      vehicleCharacterOffsetY: 17,
      vehicleOffsetX: 0,
      vehicleCanvasHeight: 81,
    });

    expect(geometry.sceneScale).toBe(SLIME_SCENE_SCALE);
    expect(geometry.floorScale).toBe(SLIME_FLOOR_SCALE);
    expect(geometry.sceneWidth).toBe(96);
    expect(geometry.sceneHeight).toBe(96);
    expect(geometry.sceneInsetX).toBe(16);
    expect(geometry.sceneInsetY).toBe(16);
    expect(geometry.floorWidth).toBe(72);
    expect(geometry.floorHeight).toBe(72);
    expect(geometry.floorInsetX).toBe(12);
    expect(geometry.vehicleRise).toBe(14);
    expect(geometry.vehicleBob).toBe(-1);
    expect(geometry.riderOffsetY).toBe(-15);
    expect(geometry.vehicleTop).toBe(-17);
    expect(geometry.vehicleLeft).toBe(0);
    expect(geometry.vehicleCanvasHeight).toBe(81);
    expect(geometry.vehicleFrameWidth).toBe(64);
    expect(viewportHeight).toBe(Math.max(96, 16 + 64 + 14));
  });

  it("scales duck-tube seating offsets with integer renderer scale", () => {
    const { geometry } = resolveSlimeSpriteGeometry({
      sourceWidth: 64,
      sourceHeight: 64,
      rendererScale: 2,
      expandedScene: true,
      vehicleRiseY: 14,
      vehicleBobY: 0,
      vehicleCharacterOffsetY: 17,
      vehicleOffsetX: -4,
      vehicleCanvasHeight: 81,
    });

    expect(geometry.baseWidth).toBe(128);
    expect(geometry.sceneWidth).toBe(192);
    expect(geometry.sceneInsetX).toBe(32);
    expect(geometry.vehicleRise).toBe(28);
    expect(geometry.riderOffsetY).toBe(-28);
    expect(geometry.vehicleTop).toBe(-34);
    expect(geometry.vehicleLeft).toBe(-8);
    expect(geometry.vehicleFrameWidth).toBe(128);
  });

  it("preserves texture-packer frame offsets", () => {
    expect(
      slimeFrameOffset(
        {
          frame: { x: 10, y: 4 },
          spriteSourceSize: { x: 2, y: 6 },
        },
        2,
        -8,
      ),
    ).toEqual({ left: -16, top: -4 });
  });
});
