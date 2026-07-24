import { describe, expect, it, vi } from "vitest";

vi.mock("../../apps/mobile/lib/slime-assets.generated", () => {
  const frame = {
    filename: "frame-0.aseprite",
    frame: { x: 0, y: 0, w: 64, h: 64 },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
    sourceSize: { w: 64, h: 64 },
    duration: 125,
  } as const;
  const asset = (key: string, evolution: string, color: string, action: string) => ({
    key,
    evolution,
    color,
    action,
    imageScale: 4,
    metadata: {
      frames: [frame],
      meta: {
        image: "sheet.png",
        format: "RGBA8888",
        size: { w: 64, h: 64 },
        scale: "1",
      },
    },
    sheet: 1,
  } as const);
  return { SLIME_MOBILE_ANIMATION_MANIFEST: {
    schemaVersion: 1,
    imageScale: 4,
    colors: ["blue", "green", "yellow", "purple", "red"],
    evolutions: ["base", "gold-crown-red-gem", "silver-crown-blue-gem"],
    actions: ["idle", "happy", "drink", "water-puddle", "trampoline"],
    playbackByAction: {
      idle: { loop: true, oneShot: false },
      // Deliberately differs from the production policy so this test proves
      // the resolver consumes generated manifest metadata instead of a local rule.
      happy: { loop: true, oneShot: false },
      drink: { loop: false, oneShot: true },
      "water-puddle": { loop: false, oneShot: true },
      trampoline: { loop: false, oneShot: true },
    },
    assets: {
      "base/blue/idle": asset("base/blue/idle", "base", "blue", "idle"),
      "base/blue/happy": asset("base/blue/happy", "base", "blue", "happy"),
      "gold-crown-red-gem/blue/drink": asset(
        "gold-crown-red-gem/blue/drink",
        "gold-crown-red-gem",
        "blue",
        "drink",
      ),
      "base/blue/water-puddle": asset(
        "base/blue/water-puddle",
        "base",
        "blue",
        "water-puddle",
      ),
    },
    crownOverlays: {
      "gold-crown-red-gem/blue": {
        key: "gold-crown-red-gem/blue",
        imageScale: 4,
        differingPixels: 10,
        overlay: 2,
      },
    },
    shared: {
      grassFloor: {
        key: "grass-floor",
        imageScale: 4,
        surfaceY: 44,
        slimeFootY: 56,
        source: "grass-floor.png",
        image: 3,
      },
      cookie: {
        key: "cookie-shop-icon-256",
        imageScale: 1,
        source: "cookie.png",
        image: 4,
      },
      sharedPuddle: null,
    },
  } };
});

import {
  getSlimeFrame,
  resolveSlimeAsset,
  SLIME_ASSET_COLORS,
  SLIME_EVOLUTIONS,
  SLIME_SHEET_ACTIONS,
} from "../../apps/mobile/lib/slime-assets";

describe("mobile slime animation manifest", () => {
  it("derives asset dimensions from the generated manifest", () => {
    expect(SLIME_ASSET_COLORS).toEqual(["blue", "green", "yellow", "purple", "red"]);
    expect(SLIME_EVOLUTIONS).toContain("gold-crown-red-gem");
    expect(SLIME_SHEET_ACTIONS).toContain("water-puddle");
  });

  it("uses manifest playback metadata and crown overlay resolution", () => {
    const resolution = resolveSlimeAsset({
      slimeColor: "blue",
      evolution: "gold-crown-red-gem",
      action: "happy",
      equippedFloor: "none",
    });

    expect(resolution.assetKey).toBe("base/blue/happy");
    expect(resolution.crownOverlay?.key).toBe("gold-crown-red-gem/blue");
    expect(resolution.playback).toEqual({ loop: true, oneShot: false });
    expect(getSlimeFrame(resolution, -1)).toMatchObject({
      filename: "frame-0.aseprite",
      frame: { x: 0, y: 0, w: 64, h: 64 },
      duration: 125,
    });
  });

  it("keeps equipped animation sheets one-shot", () => {
    const resolution = resolveSlimeAsset({
      slimeColor: "blue",
      evolution: "base",
      action: "floor-interaction",
      equippedFloor: "water-puddle",
    });

    expect(resolution.resolvedAction).toBe("water-puddle");
    expect(resolution.playback).toEqual({ loop: false, oneShot: true });
  });
});
