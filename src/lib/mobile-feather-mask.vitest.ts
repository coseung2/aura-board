import { promises as fs } from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  SCENE_BACKGROUND_FEATHER_RATIO,
  sceneBackgroundFeatherAlpha,
} from "../../apps/mobile/components/slime/slime-types";

const maskPath = path.resolve(
  __dirname,
  "..",
  "..",
  "apps",
  "mobile",
  "assets",
  "slimes",
  "shared",
  "scene-background-feather-mask.png",
);

async function readMask() {
  return PNG.sync.read(await fs.readFile(maskPath));
}

describe("scene background feather mask", () => {
  /**
   * The renderer replaced four nested `MaskedView`s with this single prebaked
   * mask. These assertions are what keep the two in step: if the mask is
   * regenerated with different math, or the ratio changes without regenerating,
   * the alpha product no longer matches and this fails.
   */
  it("is a square mask authored at the resolution the renderer stretches", async () => {
    const mask = await readMask();
    expect(mask.width).toBe(128);
    expect(mask.height).toBe(128);
  });

  it("carries the alpha product the four nested masks produced", async () => {
    const mask = await readMask();
    const alphaAt = (x: number, y: number) => mask.data[(y * mask.width + x) * 4 + 3] / 255;

    const inset = mask.width * SCENE_BACKGROUND_FEATHER_RATIO;
    const center = mask.width / 2;
    const rampMid = Math.floor(inset / 2);

    // Fully opaque away from every edge.
    expect(alphaAt(center, center)).toBe(1);
    // Halfway along one ramp keeps the other axis opaque. Smoothstep puts this
    // near the midpoint rather than exactly on it.
    const rampMidAlpha = alphaAt(rampMid, center);
    expect(rampMidAlpha).toBeGreaterThan(0.4);
    expect(rampMidAlpha).toBeLessThan(0.65);
    expect(alphaAt(center, rampMid)).toBeCloseTo(rampMidAlpha, 2);
    // A corner multiplies both ramps. `min` would hold the single-axis value here
    // and visibly square off the corner fade.
    expect(alphaAt(rampMid, rampMid)).toBeCloseTo(rampMidAlpha * rampMidAlpha, 2);
    // The outermost pixel is very nearly clear.
    expect(alphaAt(0, 0)).toBeLessThan(0.01);
  });

  it("fades gradually rather than in a thin band", async () => {
    const mask = await readMask();
    const alphaAt = (x: number, y: number) => mask.data[(y * mask.width + x) * 4 + 3] / 255;
    const center = mask.height / 2;

    // The ramp must still be climbing well past the old 1/16 boundary, which is
    // what makes the falloff read as gradual instead of a visible edge band.
    const oldBoundary = Math.round(mask.width / 16);
    expect(alphaAt(oldBoundary, center)).toBeLessThan(0.6);

    // Alpha must rise monotonically from the edge toward the centre.
    let previous = -1;
    for (let x = 0; x <= Math.floor(mask.width * SCENE_BACKGROUND_FEATHER_RATIO); x += 1) {
      const alpha = alphaAt(x, center);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      previous = alpha;
    }
    expect(previous).toBeCloseTo(1, 2);
  });

  it("matches the documented alpha contract at every sampled pixel", async () => {
    const mask = await readMask();
    let maxDelta = 0;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const expected = sceneBackgroundFeatherAlpha(
          (x + 0.5) / mask.width,
          (y + 0.5) / mask.height,
        );
        const actual = mask.data[(y * mask.width + x) * 4 + 3] / 255;
        maxDelta = Math.max(maxDelta, Math.abs(expected - actual));
      }
    }
    // One 8-bit step of rounding is the only allowed difference.
    expect(maxDelta).toBeLessThanOrEqual(1 / 255);
  });

  it("stays opaque white so only the alpha channel masks", async () => {
    const mask = await readMask();
    for (let index = 0; index < mask.data.length; index += 4) {
      expect(mask.data[index]).toBe(255);
      expect(mask.data[index + 1]).toBe(255);
      expect(mask.data[index + 2]).toBe(255);
    }
  });
});
