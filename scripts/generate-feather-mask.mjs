#!/usr/bin/env node

/**
 * Generate the single alpha mask used to feather scene background edges.
 *
 * The mobile renderer used to nest four `MaskedView`s, one per edge, each with
 * its own SVG gradient. Nested masks multiply alpha, so every animated frame went
 * through four native masking stages. This bakes that same product into one
 * reusable mask image so a background needs a single masking stage.
 *
 * Alpha is the product of a horizontal and a vertical ramp:
 *
 *   ramp(p) = smoothstep(clamp(min(p, 1 - p) / ratio, 0, 1))
 *   alpha   = ramp(x / w) * ramp(y / h)
 *
 * Two properties are deliberate. The ramp is smoothstepped, so the fade eases in
 * at the outer edge and eases out where it meets opaque art rather than ending on
 * a visible crease. And the two axes are multiplied, never minimized: a minimum
 * would hold corners at the single-axis value and square off the corner fade.
 *
 * Keep this in step with `sceneBackgroundFeatherAlpha` in the mobile renderer;
 * a test compares every mask pixel against that function.
 *
 * Because the feather inset is a fixed 1/16 of each axis, the mask is scale free:
 * stretching this one image to any square container reproduces the same
 * proportional feather.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(
  projectRoot,
  "apps",
  "mobile",
  "assets",
  "slimes",
  "shared",
  "scene-background-feather-mask.png",
);

/**
 * Mask resolution. Backgrounds render at 64-128 logical pixels, so 128 is already
 * beyond the sampled detail; the mask is stretched, never tiled.
 */
const SIZE = 128;
/** Matches `SCENE_BACKGROUND_FEATHER_RATIO` in the mobile renderer. */
const FEATHER_RATIO = 3 / 16;

function ramp(position, size, inset) {
  const rising = Math.min(position / inset, 1);
  const falling = Math.min((size - position) / inset, 1);
  const linear = Math.max(0, Math.min(rising, falling, 1));
  // Smoothstep: zero slope at both ends, so neither the outer edge nor the seam
  // against opaque art shows a crease.
  return linear * linear * (3 - 2 * linear);
}

async function main() {
  const inset = SIZE * FEATHER_RATIO;
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    const vertical = ramp(y + 0.5, SIZE, inset);
    for (let x = 0; x < SIZE; x += 1) {
      const horizontal = ramp(x + 0.5, SIZE, inset);
      const offset = (y * SIZE + x) * 4;
      // White fill; only the alpha channel carries the mask.
      raw[offset] = 255;
      raw[offset + 1] = 255;
      raw[offset + 2] = 255;
      raw[offset + 3] = Math.round(horizontal * vertical * 255);
    }
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toFile(target);

  const alphaAt = (x, y) =>
    Number(
      (
        (ramp(x + 0.5, SIZE, inset) * ramp(y + 0.5, SIZE, inset) * 255) /
        255
      ).toFixed(4),
    );
  const { size } = await fs.stat(target);
  console.log(
    JSON.stringify(
      {
        target: target.split(path.sep).join("/").replace(`${projectRoot.split(path.sep).join("/")}/`, ""),
        size: [SIZE, SIZE],
        featherRatio: FEATHER_RATIO,
        bytes: size,
        samples: {
          center: alphaAt(SIZE / 2, SIZE / 2),
          leftRampMidpoint: alphaAt(inset / 2, SIZE / 2),
          topRampMidpoint: alphaAt(SIZE / 2, inset / 2),
          cornerBothMidpoints: alphaAt(inset / 2, inset / 2),
          outerCorner: alphaAt(0, 0),
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main };
