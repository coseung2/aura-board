#!/usr/bin/env node

/**
 * Bootstrap the per-action wearable overlays into the canonical overlay layout.
 *
 * The composition package publishes wearables for the idle and drink timelines.
 * The remaining character actions are authored elsewhere in the source package as
 * complete character-plus-wearable sheets, one per action, option, and color:
 *
 *   props/wearables/<role>/<option>/jump/<trampoline|water-puddle>/<color>/
 *
 * This script extracts the wearable layer from those sheets so every action joins
 * the same anchor pipeline. Once extracted, adding a new drink never touches them,
 * and a new hat only needs its own per-action sources rather than a rebake of
 * every character combination.
 *
 * Extraction is verified, not assumed. For each frame the character sheet is
 * aligned under the combined sheet so no body pixel is lost, the pixels the
 * combined sheet paints on top become the wearable layer, and the result must be
 * identical across all five slime colors before a single shared sheet is written.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendoredRoot = path.join(projectRoot, "assets-source", "slime-wearables", "overlays");

const SLIME_COLORS = ["blue", "green", "purple", "red", "yellow"];
const FRAME_WIDTH = 64;
/**
 * Body misalignment tolerated while locating the character silhouette.
 *
 * Jump overlays are authored on a taller canvas whose extra headroom sits above
 * the grounded pose, so the character sheet aligns well below the top edge. The
 * bound therefore has to cover that headroom rather than a pixel or two of drift.
 */
const MAX_BODY_OFFSET = 24;

/**
 * Actions whose wearable art lives outside the composition package.
 *
 * `character` is the authored base animation and `combined` is the same animation
 * with the wearable already drawn in. Both must share a frame count; their canvas
 * layout may differ, which is why frame rectangles come from each sheet's JSON.
 */
const ACTIONS = [
  {
    timeline: "trampoline",
    /**
     * Jump actions are grounded differently from the standing actions: the slime
     * leaves the floor, so the overlay canvas is taller and the body sits lower
     * inside it. `grounded: false` marks that, and the importer records the
     * measured offset so the runtime never mixes the two canvases.
     */
    grounded: false,
    character: (sourceRoot, color) => path.join(sourceRoot, "floors", "trampoline", color),
    combined: (sourceRoot, role, option, color) =>
      path.join(sourceRoot, "props", "wearables", role, option, "jump", "trampoline", color),
  },
  {
    timeline: "water-puddle",
    grounded: false,
    character: (sourceRoot, color) => path.join(sourceRoot, "floors", "water-puddle", "jump", color),
    combined: (sourceRoot, role, option, color) =>
      path.join(sourceRoot, "props", "wearables", role, option, "jump", "water-puddle", color),
  },
];

/**
 * Canvas height expected for each action family.
 *
 * Standing actions share the 64px character canvas. Jump actions use a taller
 * canvas, and mixing the two would offset every wearable by the headroom, so the
 * importer asserts the family rather than accepting whatever the sheet declares.
 */
const GROUNDED_CANVAS_HEIGHT = 64;
const JUMP_CANVAS_HEIGHT = 81;

const WEARABLE_ROLES = ["headwear", "eyewear", "blush"];

const toPosix = (value) => value.split(path.sep).join("/");

function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write wearable overlays outside the project: ${outputRoot}`);
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Locate the single `*-sheet.png` / `*-sheet.json` pair inside a directory. */
async function findSheetPair(directory, label) {
  const entries = await fs.readdir(directory).catch(() => null);
  if (!entries) throw new Error(`Missing ${label} directory: ${directory}`);
  const png = entries.filter((name) => name.endsWith("-sheet.png"));
  const json = entries.filter((name) => name.endsWith("-sheet.json"));
  if (png.length !== 1 || json.length !== 1) {
    throw new Error(
      `Expected exactly one sheet pair in ${directory}, found ${png.length} PNG and ${json.length} JSON`,
    );
  }
  return { png: path.join(directory, png[0]), json: path.join(directory, json[0]) };
}

/**
 * Decode one sheet into per-frame maps of opaque pixels.
 *
 * Frame rectangles come from the sheet JSON rather than a fixed grid, so a
 * combined sheet laid out as one long row decodes the same as a character sheet
 * laid out as a grid.
 */
async function decodeSheet(pair, label) {
  const metadata = JSON.parse(await fs.readFile(pair.json, "utf8"));
  if (!Array.isArray(metadata.frames) || metadata.frames.length === 0) {
    throw new Error(`Invalid frame list in ${label}: ${pair.json}`);
  }
  const { data, info } = await sharp(pair.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frames = metadata.frames.map((frame, index) => {
    const rect = frame.frame;
    if (rect.w !== FRAME_WIDTH) {
      throw new Error(`Unexpected frame width in ${label} frame ${index}: ${rect.w}`);
    }
    const pixels = new Map();
    for (let y = 0; y < rect.h; y += 1) {
      for (let x = 0; x < rect.w; x += 1) {
        const offset = ((rect.y + y) * info.width + rect.x + x) * 4;
        if (data[offset + 3] === 0) continue;
        pixels.set(
          `${x},${y}`,
          `${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`,
        );
      }
    }
    return pixels;
  });
  return {
    frames,
    durations: metadata.frames.map((frame) => frame.duration),
    frameHeight: metadata.frames[0].frame.h,
  };
}

function shiftFrame(frame, dy) {
  if (dy === 0) return frame;
  const moved = new Map();
  for (const [position, color] of frame) {
    const [x, y] = position.split(",").map(Number);
    moved.set(`${x},${y + dy}`, color);
  }
  return moved;
}

/**
 * Return the pixels the combined frame paints on top of the aligned character
 * frame. A valid alignment must not lose any body pixel, because the wearable
 * draws over the slime rather than carving it away.
 */
function paintedPixels(characterFrame, combinedFrame, context) {
  for (let dy = 0; dy <= MAX_BODY_OFFSET; dy += 1) {
    const aligned = shiftFrame(characterFrame, dy);
    let occluded = false;
    for (const position of aligned.keys()) {
      if (!combinedFrame.has(position)) {
        occluded = true;
        break;
      }
    }
    if (occluded) continue;
    const painted = new Map();
    for (const [position, color] of combinedFrame) {
      if (aligned.get(position) !== color) painted.set(position, color);
    }
    return { painted, aligned, bodyOffset: dy };
  }
  throw new Error(
    `Unable to align the character sheet under the combined sheet for ${context}. ` +
      "The combined sheet is not the character sheet plus an overlay; update this importer deliberately.",
  );
}

/** Keep only the pixels every color paints with an identical value. */
function agreedOverlay(paintedByColor) {
  const [first, ...rest] = [...paintedByColor.values()];
  const overlay = new Map();
  for (const [position, color] of first) {
    if (rest.every((other) => other.get(position) === color)) overlay.set(position, color);
  }
  return overlay;
}

async function writeOverlaySheet(frames, frameHeight, target) {
  const width = FRAME_WIDTH * frames.length;
  const raw = Buffer.alloc(width * frameHeight * 4);
  frames.forEach((frame, frameIndex) => {
    for (const [position, color] of frame) {
      const [x, y] = position.split(",").map(Number);
      const offset = (y * width + frameIndex * FRAME_WIDTH + x) * 4;
      const [r, g, b, a] = color.split(",").map(Number);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  });
  await fs.mkdir(path.dirname(target), { recursive: true });
  const buffer = await sharp(raw, { raw: { width, height: frameHeight, channels: 4 } }).png().toBuffer();
  await fs.writeFile(target, buffer);
  return buffer;
}

/** Mirror the external overlay metadata shape, with identity transforms. */
function overlayMetadata(role, option, timeline, color, durations, frameHeight, sourceInfo) {
  return {
    frames: durations.map((duration, index) => ({
      frame: { x: index * FRAME_WIDTH, y: 0, w: FRAME_WIDTH, h: frameHeight },
      duration,
    })),
    meta: {
      image: `${color}.png`,
      size: { w: FRAME_WIDTH * durations.length, h: frameHeight },
      frame_size: { w: FRAME_WIDTH, h: frameHeight },
      frame_count: durations.length,
      alpha: "binary",
      role,
      action: timeline,
      color,
      option,
      source: sourceInfo.source,
      source_sha256: sourceInfo.sourceSha256,
      transforms: durations.map((_, index) => ({ source_idle_frame: index, dx: 0, dy: 0 })),
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const sourceArgument = argv[0];
  if (!sourceArgument || argv.length !== 1 || sourceArgument === "--help" || sourceArgument === "-h") {
    console.error("Usage: node scripts/import-slime-wearable-actions.mjs <SlimeAssets>");
    if (sourceArgument === "--help" || sourceArgument === "-h") return;
    process.exitCode = 2;
    return;
  }

  const sourceRoot = path.resolve(sourceArgument);
  const sourceStat = await fs.stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error(`SlimeAssets source directory does not exist: ${sourceRoot}`);
  }
  const sourceRealRoot = await fs.realpath(sourceRoot);
  const projectRealRoot = await fs.realpath(projectRoot);
  if (
    sourceRealRoot === projectRealRoot ||
    sourceRealRoot.startsWith(`${projectRealRoot}${path.sep}`)
  ) {
    throw new Error("SlimeAssets source must be external to the project runtime roots");
  }

  const written = [];
  const skipped = [];
  /** Measured character offset per action, which tells jump apart from grounded. */
  const bodyOffsetsByAction = new Map();
  const inputHashes = {};
  let verifiedFrames = 0;

  for (const role of WEARABLE_ROLES) {
    const roleRoot = path.join(sourceRoot, "props", "wearables", role);
    if (!(await exists(roleRoot))) continue;
    const options = (await fs.readdir(roleRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const option of options) {
      for (const action of ACTIONS) {
        const available = await Promise.all(
          SLIME_COLORS.map((color) => exists(action.combined(sourceRoot, role, option, color))),
        );
        if (!available.every(Boolean)) {
          skipped.push(`${role}/${option}/${action.timeline}`);
          continue;
        }

        const paintedByColor = new Map();
        const alignedByColor = new Map();
        const combinedByColor = new Map();
        let durations = null;
        let frameHeight = null;
        const actionOffsets = new Set();

        for (const color of SLIME_COLORS) {
          const characterPair = await findSheetPair(
            action.character(sourceRoot, color),
            `${action.timeline} character`,
          );
          const combinedPair = await findSheetPair(
            action.combined(sourceRoot, role, option, color),
            `${role}/${option} ${action.timeline}`,
          );
          const character = await decodeSheet(characterPair, `${action.timeline} character ${color}`);
          const combined = await decodeSheet(combinedPair, `${role}/${option} ${action.timeline} ${color}`);
          if (character.frames.length !== combined.frames.length) {
            throw new Error(
              `${role}/${option} ${action.timeline} (${color}) has ${combined.frames.length} frames ` +
                `against ${character.frames.length} character frames`,
            );
          }
          durations ??= combined.durations;
          frameHeight ??= combined.frameHeight;
          if (combined.frameHeight !== frameHeight) {
            throw new Error(`${role}/${option} ${action.timeline} has inconsistent frame heights across colors`);
          }
          const expectedHeight = action.grounded ? GROUNDED_CANVAS_HEIGHT : JUMP_CANVAS_HEIGHT;
          if (combined.frameHeight !== expectedHeight) {
            throw new Error(
              `${role}/${option} ${action.timeline} (${color}) is ${combined.frameHeight}px tall, expected ` +
                `${expectedHeight}px for a ${action.grounded ? "grounded" : "jump"} action. ` +
                "Grounded and jump canvases must not be mixed.",
            );
          }

          const painted = [];
          const aligned = [];
          for (let index = 0; index < combined.frames.length; index += 1) {
            const result = paintedPixels(
              character.frames[index],
              combined.frames[index],
              `${role}/${option} ${action.timeline} (${color}) frame ${index}`,
            );
            painted.push(result.painted);
            aligned.push(result.aligned);
            actionOffsets.add(result.bodyOffset);
            if (action.grounded && result.bodyOffset !== 0) {
              throw new Error(
                `${role}/${option} ${action.timeline} (${color}) frame ${index} needed a ${result.bodyOffset}px ` +
                  "body offset, but grounded actions share the character canvas and must align exactly.",
              );
            }
          }
          paintedByColor.set(color, painted);
          alignedByColor.set(color, aligned);
          combinedByColor.set(color, combined.frames);
          inputHashes[`${role}/${option}/${action.timeline}/${color}`] = {
            combinedSheet: toPosix(path.relative(sourceRoot, combinedPair.png)),
            combinedSha256: sha256(await fs.readFile(combinedPair.png)),
            characterSheet: toPosix(path.relative(sourceRoot, characterPair.png)),
            characterSha256: sha256(await fs.readFile(characterPair.png)),
          };
        }

        // A single action must place the body consistently. A spread here would
        // mean the overlay canvas drifts frame to frame, which the runtime's fixed
        // per-action offset cannot express.
        if (actionOffsets.size !== 1) {
          throw new Error(
            `${role}/${option} ${action.timeline} needs varying body offsets ` +
              `(${[...actionOffsets].sort((a, b) => a - b).join(", ")}); the overlay canvas is not stable.`,
          );
        }
        const [bodyOffset] = [...actionOffsets];
        const knownOffset = bodyOffsetsByAction.get(action.timeline);
        if (knownOffset !== undefined && knownOffset !== bodyOffset) {
          throw new Error(
            `${action.timeline} body offset differs between options (${knownOffset} vs ${bodyOffset})`,
          );
        }
        bodyOffsetsByAction.set(action.timeline, bodyOffset);

        // Build the shared overlay frame by frame, then require that recompositing
        // it over each color's own body reproduces the authored sheet exactly.
        const overlayFrames = [];
        for (let index = 0; index < durations.length; index += 1) {
          const overlay = agreedOverlay(
            new Map([...paintedByColor.entries()].map(([color, frames]) => [color, frames[index]])),
          );
          if (overlay.size === 0) {
            throw new Error(`No overlay pixels agreed across colors for ${role}/${option} ${action.timeline} frame ${index}`);
          }
          for (const color of SLIME_COLORS) {
            const recomposed = new Map(alignedByColor.get(color)[index]);
            for (const [position, value] of overlay) recomposed.set(position, value);
            const authored = combinedByColor.get(color)[index];
            if (recomposed.size !== authored.size) {
              throw new Error(
                `Recomposing ${role}/${option} ${action.timeline} (${color}) frame ${index} does not ` +
                  "reproduce the authored sheet; update this importer deliberately.",
              );
            }
            for (const [position, value] of authored) {
              if (recomposed.get(position) !== value) {
                throw new Error(
                  `Recomposing ${role}/${option} ${action.timeline} (${color}) frame ${index} differs at ${position}`,
                );
              }
            }
            verifiedFrames += 1;
          }
          overlayFrames.push(overlay);
        }

        const optionRoot = path.join(vendoredRoot, role, option, action.timeline);
        assertProjectOutput(optionRoot);
        await fs.rm(optionRoot, { recursive: true, force: true });
        const buffer = await writeOverlaySheet(
          overlayFrames,
          frameHeight,
          path.join(optionRoot, `${SLIME_COLORS[0]}.png`),
        );
        for (const color of SLIME_COLORS) {
          await fs.writeFile(path.join(optionRoot, `${color}.png`), buffer);
          const inputs = inputHashes[`${role}/${option}/${action.timeline}/${color}`];
          await writeJson(
            path.join(optionRoot, `${color}.json`),
            overlayMetadata(role, option, action.timeline, color, durations, frameHeight, {
              source: inputs.combinedSheet,
              sourceSha256: inputs.combinedSha256,
            }),
          );
        }
        written.push({
          key: `${role}/${option}/${action.timeline}`,
          frames: durations.length,
          frameHeight,
          grounded: action.grounded,
          characterBodyOffset: bodyOffset,
          overlayPixels: overlayFrames[0].size,
          sha256: sha256(buffer),
        });
      }
    }
  }

  await writeJson(path.join(projectRoot, "assets-source", "slime-wearables", "action-provenance.json"), {
    generatedBy: "scripts/import-slime-wearable-actions.mjs",
    purpose:
      "Extract per-action wearable overlays from the combined character-plus-wearable sheets so every " +
      "character action joins the anchor pipeline. Replace with published overlays when available.",
    externalSource: toPosix(sourceRoot),
    extractionRule:
      "Per frame, align the character sheet under the combined sheet without losing any body pixel, take " +
      "the pixels the combined sheet paints, and keep only those all five colors agree on. Recompositing " +
      "must reproduce the authored sheet exactly.",
    inputs: inputHashes,
    written,
    skipped,
    /**
     * Character offset inside each action's overlay canvas. Grounded actions are 0;
     * jump actions are positive because their canvas adds headroom above the pose.
     */
    characterBodyOffsetByAction: Object.fromEntries([...bodyOffsetsByAction.entries()].sort()),
  });

  console.log(
    JSON.stringify(
      {
        source: sourceRoot,
        extractedOverlays: written.length,
        verifiedFrames,
        characterBodyOffsetByAction: Object.fromEntries([...bodyOffsetsByAction.entries()].sort()),
        skipped,
        generated: {
          vendoredSource: toPosix(path.relative(projectRoot, vendoredRoot)),
          provenance: "assets-source/slime-wearables/action-provenance.json",
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
