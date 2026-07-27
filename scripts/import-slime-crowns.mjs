#!/usr/bin/env node

/**
 * Bootstrap the level-up crowns into a canonical wearable source package.
 *
 * Crowns used to live baked into per-evolution character sheets, which meant a
 * crowned slime could never wear a different hat. Extracting the crown into its
 * own per-frame overlay lets a growth-stage crown and a player-selected hat be
 * two values of the same headwear slot.
 *
 * This is a one-time recovery tool, not part of the normal build. The external
 * asset package has not published a crown overlay yet, and its `backups/` tree
 * is explicitly not production. So this script reads the baked crowned sheets
 * once and writes a vendored canonical source package into the repository at
 * `assets-source/slime-wearables/headwear/`, together with a `provenance.json`
 * recording every input hash and the extraction rule.
 *
 * `import-slime-wearables.mjs` then consumes that vendored source exactly like
 * any other wearable option, so ordinary imports never read `backups/`. Once the
 * asset owner publishes byte-identical files at
 * `props/composition/overlays/headwear/<evolution>/idle/`, point the wearables
 * importer at the external package and delete the vendored bridge.
 *
 * Extraction is verified, not assumed. The crown is defined as the pixels that
 * every slime color agrees on: for each color the importer aligns the base sheet
 * against the crowned sheet, takes the pixels the crowned sheet adds, and then
 * keeps only the intersection where all five colors carry the same value. That
 * cross-color agreement is what makes the overlay genuinely color-independent,
 * and it also discards body-silhouette residue left by the mouth update.
 *
 * The authored crowned sheets predate a mouth update to the character art, so
 * diffing them against the current base sheets would fold a few stale body
 * outline pixels into the crown. The importer therefore diffs against the
 * character sheets the crowned art was actually drawn over, preferring the
 * pre-update backup when the source package still carries it, and asserts that
 * the crown is a constant silhouette shared by all five colors.
 *
 * The idle and happy timelines are imported, because their crowned sheets share
 * the base canvas and frame count. The jump floor timelines do not: crowned art
 * is 1664x75 across 26 frames against a 832x128, 13-frame base, so those keep
 * using their baked sheets.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Vendored canonical source, quarantined from both the generated runtime output
 * and the external package. It mirrors the external overlay layout so the
 * wearables importer needs no special case.
 */
const vendoredRoot = path.join(projectRoot, "assets-source", "slime-wearables", "overlays", "headwear");

const SLIME_COLORS = ["blue", "green", "purple", "red", "yellow"];
const CROWN_EVOLUTIONS = ["gold-crown-red-gem", "silver-crown-blue-gem"];
const CANVAS = { width: 64, height: 64 };

/**
 * Timelines whose crowned sheets share the base canvas, so the crown can be
 * extracted as an overlay. `frameCount` is asserted against both sheets.
 */
const CROWN_TIMELINES = [
  {
    timeline: "idle",
    frameCount: 8,
    baseSources: [
      {
        label: "pre-mouth-update-backup",
        resolve: (sourceRoot, color) =>
          path.join(
            sourceRoot,
            "backups",
            "idle-before-mouth-update-20260726-235024",
            "characters",
            color,
            "idle",
            `slime-${color}-idle-sheet.png`,
          ),
      },
      {
        label: "composition-base",
        resolve: (sourceRoot, color) =>
          path.join(sourceRoot, "props", "composition", "base", "idle", color, "slime.png"),
      },
    ],
    crowned: (sourceRoot, evolution, color) =>
      path.join(
        sourceRoot,
        "level-up",
        "crowned-idle-assets",
        evolution,
        "idle",
        color,
        `slime-${color}-idle-${evolution}-sheet.png`,
      ),
    durations: (sourceRoot, color) =>
      path.join(sourceRoot, "props", "composition", "base", "idle", color, "slime.json"),
  },
  {
    timeline: "happy",
    frameCount: 12,
    baseSources: [
      {
        label: "happy-heart-assets",
        resolve: (sourceRoot, color) =>
          path.join(
            sourceRoot,
            "food",
            "happy-heart-assets",
            color,
            `slime-${color}-happy-heart-sheet.png`,
          ),
      },
    ],
    crowned: (sourceRoot, evolution, color) =>
      path.join(
        sourceRoot,
        "level-up",
        "crowned-happy-assets",
        evolution,
        "happy",
        color,
        `slime-${color}-happy-${evolution}-sheet.png`,
      ),
    durations: (sourceRoot, color) =>
      path.join(sourceRoot, "food", "happy-heart-assets", color, `slime-${color}-happy-heart-sheet.json`),
  },
];

/**
 * Crown drink timelines are intentionally not bootstrapped here.
 *
 * `level-up/crowned-drink-assets` only covers lemonade, and its sheets composite
 * the drink as well as the crown, so a clean crown cannot be isolated by diffing
 * against the drink-free character base. Rather than special-case one flavor, the
 * asset owner should publish crown drink overlays through the normal wearable
 * pipeline. Until then the runtime suppresses the crown layer while drinking,
 * which keeps the player's chosen flavor correct.
 */

/** Body misalignment tolerated while locating the character silhouette. */
const MAX_BODY_OFFSET = 3;
/**
 * The crown silhouette every authored frame shares. Asserting the exact count
 * keeps a future base-art revision from quietly folding body pixels into the
 * shared crown overlay.
 */
const CROWN_PIXELS_PER_FRAME = 187;
/** Per-color body pixels tolerated from the pre-mouth-update crowned sheets. */
const MAX_BASE_REVISION_PIXELS = 4;

const toPosix = (value) => value.split(path.sep).join("/");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fileSha256(filePath) {
  return sha256(await fs.readFile(filePath));
}

function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write crown overlays outside the project: ${outputRoot}`);
  }
}

async function decodeSheet(filePath, frameCount) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== CANVAS.width * frameCount || info.height !== CANVAS.height) {
    throw new Error(
      `Unexpected sheet dimensions for ${filePath}: ${info.width}x${info.height}, ` +
        `expected ${CANVAS.width * frameCount}x${CANVAS.height}`,
    );
  }
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pixels = new Map();
    for (let y = 0; y < CANVAS.height; y += 1) {
      for (let x = 0; x < CANVAS.width; x += 1) {
        const offset = (y * info.width + frameIndex * CANVAS.width + x) * 4;
        if (data[offset + 3] === 0) continue;
        pixels.set(`${x},${y}`, [
          data[offset],
          data[offset + 1],
          data[offset + 2],
          data[offset + 3],
        ]);
      }
    }
    frames.push(pixels);
  }
  return frames;
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

function sameColor(a, b) {
  return Boolean(a) && Boolean(b) && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function framesEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [position, color] of a) {
    if (!sameColor(b.get(position), color)) return false;
  }
  return true;
}

/**
 * Align one color's base frame under its crowned frame and return the pixels
 * the crowned frame paints on top.
 *
 * A painted pixel is any crowned pixel that the aligned base sheet does not
 * already carry with the same value, including pixels drawn over the existing
 * body silhouette: the crown overlaps the slime's head rather than sitting
 * entirely above it.
 *
 * The base sheet is nudged within a small range because a few authored sheets
 * place the body a pixel off. A valid alignment must not lose any base pixel:
 * the crown draws over the body and never carves it away.
 */
function paintedPixels(baseFrame, crownedFrame, context) {
  const offsets = [];
  for (let dy = -MAX_BODY_OFFSET; dy <= MAX_BODY_OFFSET; dy += 1) offsets.push(dy);
  offsets.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);

  for (const bodyOffset of offsets) {
    const aligned = shiftFrame(baseFrame, bodyOffset);
    let occluded = false;
    for (const position of aligned.keys()) {
      if (!crownedFrame.has(position)) {
        occluded = true;
        break;
      }
    }
    if (occluded) continue;
    const painted = new Map();
    for (const [position, color] of crownedFrame) {
      if (!sameColor(aligned.get(position), color)) painted.set(position, color);
    }
    return { painted, aligned, bodyOffset };
  }
  throw new Error(
    `Unable to align the base sheet under the crowned sheet for ${context}. ` +
      "The crowned sheet is not the base sheet plus an overlay; update this importer deliberately.",
  );
}

/** Keep only the pixels every color paints with an identical value. */
function agreedCrown(paintedByColor) {
  const [first, ...rest] = [...paintedByColor.values()];
  const crown = new Map();
  for (const [position, color] of first) {
    if (rest.every((other) => sameColor(other.get(position), color))) crown.set(position, color);
  }
  return crown;
}

function crownSignature(frames) {
  return frames
    .map((frame) =>
      [...frame.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([position, color]) => `${position}=${color.join(",")}`)
        .join(";"),
    )
    .join("|");
}

async function writeCrownSheet(frames, target) {
  const width = CANVAS.width * frames.length;
  const raw = Buffer.alloc(width * CANVAS.height * 4);
  frames.forEach((frame, frameIndex) => {
    for (const [position, color] of frame) {
      const [x, y] = position.split(",").map(Number);
      const offset = (y * width + frameIndex * CANVAS.width + x) * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  });
  await fs.mkdir(path.dirname(target), { recursive: true });
  const buffer = await sharp(raw, { raw: { width, height: CANVAS.height, channels: 4 } }).png().toBuffer();
  await fs.writeFile(target, buffer);
  return buffer;
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Mirror the external overlay metadata shape so `import-slime-wearables.mjs`
 * consumes a vendored crown exactly like any authored wearable. Identity
 * transforms mean the crown rides the character's own idle frame order.
 */
function overlayMetadata(option, timeline, color, durations, sourceInfo) {
  return {
    frames: durations.map((duration, index) => ({
      frame: { x: index * CANVAS.width, y: 0, w: CANVAS.width, h: CANVAS.height },
      duration,
    })),
    meta: {
      image: `${color}.png`,
      size: { w: CANVAS.width * durations.length, h: CANVAS.height },
      frame_size: { w: CANVAS.width, h: CANVAS.height },
      frame_count: durations.length,
      alpha: "binary",
      role: "headwear",
      action: timeline,
      color,
      option,
      source: sourceInfo.source,
      source_sha256: sourceInfo.sourceSha256,
      transforms: Array.from({ length: durations.length }, (_, index) => ({
        source_idle_frame: index,
        dx: 0,
        dy: 0,
      })),
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const sourceArgument = argv[0];
  if (!sourceArgument || argv.length !== 1 || sourceArgument === "--help" || sourceArgument === "-h") {
    console.error("Usage: node scripts/import-slime-crowns.mjs <SlimeAssets>");
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

  const entries = [];
  const bodyOffsets = [];
  let discardedResiduePixels = 0;
  const inputHashes = {};

  /** Pick the first base-sheet source a timeline actually provides. */
  async function pickBaseSource(timelineSpec) {
    for (const candidate of timelineSpec.baseSources) {
      const available = await Promise.all(
        SLIME_COLORS.map((color) =>
          fs
            .access(candidate.resolve(sourceRoot, color))
            .then(() => true)
            .catch(() => false),
        ),
      );
      if (available.every(Boolean)) return candidate;
    }
    throw new Error(
      `No complete character base sheet set for ${timelineSpec.timeline}. ` +
        `Tried: ${timelineSpec.baseSources.map((c) => c.label).join(", ")}`,
    );
  }

  const baseSourceLabels = {};
  for (const spec of CROWN_TIMELINES) {
  const baseSheetSource = await pickBaseSource(spec);
  baseSourceLabels[spec.timeline] = baseSheetSource.label;
  for (const evolution of CROWN_EVOLUTIONS) {
    const sheets = new Map();
    for (const color of SLIME_COLORS) {
      const crownedPath = spec.crowned(sourceRoot, evolution, color);
      const basePath = baseSheetSource.resolve(sourceRoot, color);
      const [baseFrames, crownedFrames] = await Promise.all([
        decodeSheet(basePath, spec.frameCount),
        decodeSheet(crownedPath, spec.frameCount),
      ]);
      sheets.set(color, { baseFrames, crownedFrames });
      inputHashes[`${evolution}/${spec.timeline}/${color}`] = {
        crownedSheet: toPosix(path.relative(sourceRoot, crownedPath)),
        crownedSha256: await fileSha256(crownedPath),
        companionBase: toPosix(path.relative(sourceRoot, basePath)),
        companionBaseSha256: await fileSha256(basePath),
      };
    }

    const crownFrames = [];
    for (let frameIndex = 0; frameIndex < spec.frameCount; frameIndex += 1) {
      const paintedByColor = new Map();
      const alignedByColor = new Map();
      for (const [color, { baseFrames, crownedFrames }] of sheets) {
        const { painted, aligned, bodyOffset } = paintedPixels(
          baseFrames[frameIndex],
          crownedFrames[frameIndex],
          `${evolution}/${spec.timeline}/${color} frame ${frameIndex}`,
        );
        paintedByColor.set(color, painted);
        alignedByColor.set(color, aligned);
        if (bodyOffset !== 0) {
          bodyOffsets.push(
            `${evolution}/${spec.timeline}/${color} frame ${frameIndex} (dy ${bodyOffset > 0 ? "+" : ""}${bodyOffset})`,
          );
        }
      }

      const crown = agreedCrown(paintedByColor);
      if (crown.size !== CROWN_PIXELS_PER_FRAME) {
        throw new Error(
          `Expected ${CROWN_PIXELS_PER_FRAME} agreed crown pixels for ${evolution}/${spec.timeline} frame ${frameIndex}, ` +
            `found ${crown.size}. The crown silhouette changed; update this importer deliberately.`,
        );
      }

      // Any remaining per-color difference must be a small base-art revision,
      // never crown art. Anything larger means the crowned sheets and the base
      // sheets have genuinely diverged.
      for (const [color, painted] of paintedByColor) {
        const residue = painted.size - crown.size;
        if (residue < 0 || residue > MAX_BASE_REVISION_PIXELS) {
          throw new Error(
            `${evolution}/${spec.timeline}/${color} frame ${frameIndex} leaves ${residue} unexplained pixels ` +
              `(limit ${MAX_BASE_REVISION_PIXELS}); update this importer deliberately.`,
          );
        }
        discardedResiduePixels += residue;

        // Compositing the shared crown plus that color's own residue must
        // reproduce the authored sheet exactly.
        const recomposed = new Map(alignedByColor.get(color));
        for (const [position, value] of crown) recomposed.set(position, value);
        for (const [position, value] of painted) recomposed.set(position, value);
        if (!framesEqual(recomposed, sheets.get(color).crownedFrames[frameIndex])) {
          throw new Error(
            `Recomposing the shared crown over ${evolution}/${spec.timeline}/${color} frame ${frameIndex} does not ` +
              "reproduce the authored sheet; update this importer deliberately.",
          );
        }
      }
      crownFrames.push(crown);
    }

    entries.push({ option: evolution, evolution, timeline: spec.timeline, spec, frames: crownFrames });
  }
  }

  // Crown timing follows the character timeline it rides on.
  const durationsByTimeline = {};
  for (const spec of CROWN_TIMELINES) {
    const metadataPath = spec.durations(sourceRoot, SLIME_COLORS[0]);
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const durations = metadata.frames.map((frame) => frame.duration);
    if (durations.length !== spec.frameCount || durations.some((value) => !(value > 0))) {
      throw new Error(`Unusable ${spec.timeline} frame durations in ${metadataPath}`);
    }
    durationsByTimeline[spec.timeline] = durations;
  }

  // Write the vendored canonical source in the external package's own layout so
  // the wearables importer treats a crown as an ordinary headwear option.
  const crownHashes = {};
  for (const option of CROWN_EVOLUTIONS) {
    assertProjectOutput(path.join(vendoredRoot, option));
    await fs.rm(path.join(vendoredRoot, option), { recursive: true, force: true });
  }
  for (const entry of entries) {
    const optionRoot = path.join(vendoredRoot, entry.option, entry.timeline);
    assertProjectOutput(optionRoot);
    const durations = durationsByTimeline[entry.timeline];
    const buffer = await writeCrownSheet(entry.frames, path.join(optionRoot, `${SLIME_COLORS[0]}.png`));
    crownHashes[`${entry.option}/${entry.timeline}`] = sha256(buffer);
    for (const color of SLIME_COLORS) {
      // The crown is color-independent, so every color carries the same bytes.
      // Publishing all five keeps the color-collapse verification meaningful.
      await fs.writeFile(path.join(optionRoot, `${color}.png`), buffer);
      const inputs = inputHashes[`${entry.option}/${entry.timeline}/${color}`];
      await writeJson(
        path.join(optionRoot, `${color}.json`),
        overlayMetadata(entry.option, entry.timeline, color, durations, {
          source: inputs.crownedSheet,
          sourceSha256: inputs.crownedSha256,
        }),
      );
    }
  }

  await writeJson(path.join(projectRoot, "assets-source", "slime-wearables", "provenance.json"), {
    generatedBy: "scripts/import-slime-crowns.mjs",
    purpose:
      "One-time bootstrap of the level-up crowns into a canonical headwear overlay package. " +
      "Replace with the external package's published overlay once available, then delete this bridge.",
    externalSource: toPosix(sourceRoot),
    companionBaseSourceByTimeline: baseSourceLabels,
    extractionRule:
      "Per frame, align each color's character sheet under its crowned sheet without losing any body pixel, " +
      "take the pixels the crowned sheet paints, and keep only those all five colors agree on. " +
      `Every frame must yield exactly ${CROWN_PIXELS_PER_FRAME} crown pixels and recompose to the authored sheet.`,
    frameDurationsByTimeline: durationsByTimeline,
    inputs: inputHashes,
    crownSheetSha256: crownHashes,
    publishTargets: CROWN_EVOLUTIONS.flatMap((evolution) =>
      CROWN_TIMELINES.map(
        (spec) => `props/composition/overlays/headwear/${evolution}/${spec.timeline}/{color}.{png,json}`,
      ),
    ),
  });

  const report = {
    source: sourceRoot,
    baseSheetSourceByTimeline: baseSourceLabels,
    crowns: entries.map((entry) => ({
      option: entry.option,
      timeline: entry.timeline,
      pixelsPerFrame: entry.frames.map((frame) => frame.size),
    })),
    verifiedFrames:
      CROWN_EVOLUTIONS.length *
      SLIME_COLORS.length *
      CROWN_TIMELINES.reduce((total, spec) => total + spec.frameCount, 0),
    bodyAlignmentCorrections: bodyOffsets,
    discardedResiduePixels,
    importedTimelines: CROWN_TIMELINES.map((spec) => spec.timeline),
    skippedTimelines: ["water-puddle", "trampoline"],
    skippedReason: "Jump floor sheets use a different canvas and frame count than the base sheets.",
    generated: {
      vendoredSource: toPosix(path.relative(projectRoot, vendoredRoot)),
      provenance: "assets-source/slime-wearables/provenance.json",
    },
    nextStep:
      "Run scripts/import-slime-wearables.mjs with --extra-overlays assets-source/slime-wearables/overlays " +
      "to fold these crowns into the generated wearable registries.",
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main };
