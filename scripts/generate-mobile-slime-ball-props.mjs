import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public", "creatures", "slimes", "official", "props", "ball");
const mobileRoot = path.join(projectRoot, "apps", "mobile", "assets", "slimes", "props", "ball");
const registryPath = path.join(projectRoot, "apps", "mobile", "lib", "slime-props.generated.ts");
const qaRoot = path.join(projectRoot, ".codex", "tmp", "slime-props");

const CHECK_MODE = process.argv.includes("--check");
const QA_MODE = process.argv.includes("--qa");
const COLORS = ["blue", "green", "yellow", "purple", "red"];
const BALL_SLUGS = [
  "american-football",
  "baseball",
  "basketball",
  "black-ball",
  "dark-blue-ball",
  "soccer-ball",
  "tennis-ball",
];
const SOURCE_FRAME_SIZE = 64;
const SCENE_FRAME_SIZE = 96;
const FRAME_INSET = (SCENE_FRAME_SIZE - SOURCE_FRAME_SIZE) / 2;
const OUTPUT_SCALE = 4;
const COLUMNS = 6;
const FRAME_COUNT = 18;
const QA_FRAME_INDICES = [0, 8, 17];

function pixelEqual(first, second, offset) {
  return first[offset] === second[offset]
    && first[offset + 1] === second[offset + 1]
    && first[offset + 2] === second[offset + 2]
    && first[offset + 3] === second[offset + 3];
}

function opaquePixelCount(frame) {
  let count = 0;
  for (let offset = 3; offset < frame.length; offset += 4) {
    if (frame[offset] > 0) count += 1;
  }
  return count;
}

function minimumOpaqueX(frame) {
  let minimum = SOURCE_FRAME_SIZE;
  for (let pixel = 0; pixel < SOURCE_FRAME_SIZE * SOURCE_FRAME_SIZE; pixel += 1) {
    if (frame[pixel * 4 + 3] === 0) continue;
    minimum = Math.min(minimum, pixel % SOURCE_FRAME_SIZE);
  }
  return minimum;
}

function maximumOpaqueX(frame) {
  let maximum = -1;
  for (let pixel = 0; pixel < SOURCE_FRAME_SIZE * SOURCE_FRAME_SIZE; pixel += 1) {
    if (frame[pixel * 4 + 3] === 0) continue;
    maximum = Math.max(maximum, pixel % SOURCE_FRAME_SIZE);
  }
  return maximum;
}

function propTrajectoryInsets(frames) {
  const visible = frames
    .map((frame, index) => ({ index, maximumX: maximumOpaqueX(frame) }))
    .filter(({ maximumX }) => maximumX >= 0);
  if (visible.length === 0) return frames.map(() => 0);
  const edgeMaximum = Math.max(visible[0].maximumX, visible[visible.length - 1].maximumX);
  const contactMaximum = Math.max(...visible.map(({ maximumX }) => maximumX));
  const travel = Math.max(1, contactMaximum - edgeMaximum);
  return frames.map((frame) => {
    const maximumX = maximumOpaqueX(frame);
    if (maximumX < 0) return 0;
    const progress = Math.max(0, Math.min(1, (maximumX - edgeMaximum) / travel));
    return Math.round(FRAME_INSET * progress);
  });
}

function assertPropTrajectoryStartsAndEndsAtEdge(label, frames, insets) {
  const visibleFrames = frames.filter((frame) => opaquePixelCount(frame) > 0);
  if (visibleFrames.length === 0) throw new Error(`${label} has no visible prop trajectory`);
  const firstX = minimumOpaqueX(visibleFrames[0]);
  const lastX = minimumOpaqueX(visibleFrames[visibleFrames.length - 1]);
  const visibleInsets = frames
    .map((frame, index) => opaquePixelCount(frame) > 0 ? insets[index] : null)
    .filter((value) => value !== null);
  if (firstX !== 0 || lastX !== 0 || visibleInsets[0] !== 0 || visibleInsets.at(-1) !== 0) {
    throw new Error(`${label} must enter and leave at x=0; received ${firstX}/${lastX}`);
  }
  if (Math.max(...visibleInsets) !== FRAME_INSET) {
    throw new Error(`${label} must preserve its centered-source contact frame`);
  }
}

async function readSource(slug, color) {
  const base = `slime-${color}-${slug}-hit-sheet`;
  const directory = path.join(publicRoot, slug, color);
  const metadata = JSON.parse(await fs.readFile(path.join(directory, `${base}.json`), "utf8"));
  const { data, info } = await sharp(path.join(directory, `${base}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (metadata.frames.length !== FRAME_COUNT) {
    throw new Error(`${slug}/${color} must have ${FRAME_COUNT} frames`);
  }
  const layerNames = (metadata.meta?.layers ?? []).map((layer) => layer.name);
  if (!layerNames.includes("slime") || layerNames.length < 2) {
    throw new Error(`${slug}/${color} metadata must declare slime and prop source layers`);
  }
  const frames = metadata.frames.map((entry, index) => {
    const rect = entry.frame;
    if (rect.w !== SOURCE_FRAME_SIZE || rect.h !== SOURCE_FRAME_SIZE) {
      throw new Error(`${slug}/${color} frame ${index} is ${rect.w}x${rect.h}, expected 64x64`);
    }
    if (!Number.isFinite(entry.duration) || entry.duration <= 0) {
      throw new Error(`${slug}/${color} frame ${index} has invalid timing`);
    }
    const frame = Buffer.alloc(SOURCE_FRAME_SIZE * SOURCE_FRAME_SIZE * 4);
    for (let y = 0; y < SOURCE_FRAME_SIZE; y += 1) {
      const sourceStart = ((rect.y + y) * info.width + rect.x) * 4;
      data.copy(frame, y * SOURCE_FRAME_SIZE * 4, sourceStart, sourceStart + SOURCE_FRAME_SIZE * 4);
    }
    return frame;
  });
  return {
    frames,
    durations: metadata.frames.map((entry) => entry.duration),
    layerNames,
  };
}

/**
 * The checked-in PNG is flattened even though its metadata names separate
 * Aseprite layers. A pixel is safe to repeat above equipment only when it is
 * identical for this ball across every slime color and differs from at least
 * one other ball at the same position. This deliberately conservative rule can
 * omit invariant prop pixels; it never claims exact source-layer recovery.
 */
function propFrameFor(allSources, slug, color, frameIndex) {
  const target = allSources.get(`${slug}/${color}`).frames[frameIndex];
  const output = Buffer.alloc(target.length);
  for (let pixel = 0; pixel < SOURCE_FRAME_SIZE * SOURCE_FRAME_SIZE; pixel += 1) {
    const offset = pixel * 4;
    if (target[offset + 3] === 0) continue;

    const sameAcrossColors = COLORS.every((candidate) =>
      pixelEqual(target, allSources.get(`${slug}/${candidate}`).frames[frameIndex], offset));
    const differsAcrossBalls = BALL_SLUGS.some((candidate) =>
      !pixelEqual(target, allSources.get(`${candidate}/${color}`).frames[frameIndex], offset));

    if (sameAcrossColors && differsAcrossBalls) {
      target.copy(output, offset, offset, offset + 4);
    }
  }
  return output;
}

function frameWithoutProp(frame, propFrame) {
  const output = Buffer.from(frame);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (propFrame[offset + 3] === 0) continue;
    output.fill(0, offset, offset + 4);
  }
  return output;
}

function paddedAtlas(
  frames,
  columns = COLUMNS,
  insetX = FRAME_INSET,
  insetY = FRAME_INSET,
) {
  const rows = Math.ceil(frames.length / columns);
  const width = columns * SCENE_FRAME_SIZE;
  const height = rows * SCENE_FRAME_SIZE;
  const output = Buffer.alloc(width * height * 4);
  frames.forEach((frame, index) => {
    const frameInsetX = Array.isArray(insetX) ? insetX[index] ?? 0 : insetX;
    const cellX = (index % columns) * SCENE_FRAME_SIZE + frameInsetX;
    const cellY = Math.floor(index / columns) * SCENE_FRAME_SIZE + insetY;
    for (let y = 0; y < SOURCE_FRAME_SIZE; y += 1) {
      const sourceStart = y * SOURCE_FRAME_SIZE * 4;
      const targetStart = ((cellY + y) * width + cellX) * 4;
      frame.copy(output, targetStart, sourceStart, sourceStart + SOURCE_FRAME_SIZE * 4);
    }
  });
  return { output, width, height };
}

function assertTransparentCellEdges(
  label,
  atlas,
  frameCount,
  columns = COLUMNS,
  allowLeftEdge = false,
) {
  for (let index = 0; index < frameCount; index += 1) {
    const x = (index % columns) * SCENE_FRAME_SIZE;
    const y = Math.floor(index / columns) * SCENE_FRAME_SIZE;
    for (let cursor = 0; cursor < SCENE_FRAME_SIZE; cursor += 1) {
      const offsets = [
        ((y * atlas.width) + x + cursor) * 4 + 3,
        (((y + SCENE_FRAME_SIZE - 1) * atlas.width) + x + cursor) * 4 + 3,
        (((y + cursor) * atlas.width) + x + SCENE_FRAME_SIZE - 1) * 4 + 3,
      ];
      if (!allowLeftEdge) offsets.push((((y + cursor) * atlas.width) + x) * 4 + 3);
      if (offsets.some((offset) => atlas.output[offset] !== 0)) {
        throw new Error(`${label} frame ${index} touches its 96px cell edge`);
      }
    }
  }
}

async function encodeAtlas(atlas, scale = OUTPUT_SCALE) {
  return sharp(atlas.output, {
    raw: { width: atlas.width, height: atlas.height, channels: 4 },
  })
    .resize({
      width: atlas.width * scale,
      height: atlas.height * scale,
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer();
}

async function writeOrCheck(filePath, contents) {
  if (CHECK_MODE) {
    const existing = await fs.readFile(filePath);
    const expected = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    if (!existing.equals(expected)) {
      throw new Error(`${path.relative(projectRoot, filePath)} is stale; regenerate ball props`);
    }
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

function renderRegistry(entries) {
  const rows = entries.map((entry) => {
    const root = `../assets/slimes/props/ball/${entry.slug}/${entry.color}`;
    return `  ${JSON.stringify(`${entry.slug}/${entry.color}`)}: { slug: ${JSON.stringify(entry.slug)}, color: ${JSON.stringify(entry.color)}, frameCount: 18, sourceFrameSize: 64, frameSize: 96, sceneInset: 16, propSceneInsets: ${JSON.stringify(entry.propSceneInsets)}, columns: 6, imageScale: 4, separation: "flattened-consensus", durations: ${JSON.stringify(entry.durations)}, actionSheet: require(${JSON.stringify(`${root}/action-sheet.png`)}), overlaySheet: require(${JSON.stringify(`${root}/prop-sheet.png`)}) },`;
  });
  return [
    "// Generated by scripts/generate-mobile-slime-ball-props.mjs. Do not edit by hand.",
    "// Source exports are flattened; `flattened-consensus` is a conservative, non-exact prop separation.",
    "",
    `export const SLIME_MOBILE_BALL_PROP_REGISTRY = {\n${rows.join("\n")}\n} as const;`,
    "",
  ].join("\n");
}

async function writeQaContactSheet(fileName, frames, insetX = FRAME_INSET) {
  const selected = QA_FRAME_INDICES.map((index) => frames[index]);
  const selectedInsets = Array.isArray(insetX)
    ? QA_FRAME_INDICES.map((index) => insetX[index])
    : insetX;
  const native = paddedAtlas(selected, selected.length, selectedInsets);
  const enlarged = await sharp(native.output, {
    raw: { width: native.width, height: native.height, channels: 4 },
  }).resize({
    width: native.width * OUTPUT_SCALE,
    height: native.height * OUTPUT_SCALE,
    kernel: sharp.kernel.nearest,
  }).raw().toBuffer();
  const width = native.width * OUTPUT_SCALE;
  const height = native.height + native.height * OUTPUT_SCALE;
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < native.height; y += 1) {
    native.output.copy(output, y * width * 4, y * native.width * 4, (y + 1) * native.width * 4);
  }
  for (let y = 0; y < native.height * OUTPUT_SCALE; y += 1) {
    enlarged.copy(
      output,
      ((native.height + y) * width) * 4,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }
  await fs.mkdir(qaRoot, { recursive: true });
  await sharp(output, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(path.join(qaRoot, fileName));
}

async function writeQaReport(entries) {
  const report = {
    generatedBy: "scripts/generate-mobile-slime-ball-props.mjs --qa",
    sourceArt: {
      completeVariants: entries.length,
      declaredLayers: ["slime", "ball-specific prop layer"],
      editableLayerCelsAvailable: false,
      separation: "flattened-consensus",
      limitation: "The checked-in PNG sheets are flattened. The front prop layer conservatively includes only pixels invariant across slime colors and variant across ball types; exact source-layer recovery requires the original layered Aseprite cels.",
    },
    structure: {
      logicalScene: [SCENE_FRAME_SIZE, SCENE_FRAME_SIZE],
      centeredSourceFrame: [SOURCE_FRAME_SIZE, SOURCE_FRAME_SIZE],
      sceneInset: FRAME_INSET,
      propSceneInsetX: "per-frame 0..16; edge entry/exit with centered-source contact",
      outputScale: OUTPUT_SCALE,
      resampling: "nearest-neighbor",
      frameCount: FRAME_COUNT,
      timing: "preserved per source JSON",
      transparentCellEdges: true,
      contactFrames: QA_FRAME_INDICES,
      runtimeZOrder: [
        "background",
        "floor",
        "ball action/character",
        "blush/eyewear/headwear",
        "vehicle/effects",
        "prop front layer",
      ],
    },
    variants: entries.map(({ slug, color, durations, actionOpaquePixels, propOpaquePixels }) => ({
      slug,
      color,
      durations,
      actionOpaquePixels,
      propOpaquePixels,
    })),
  };
  await fs.mkdir(qaRoot, { recursive: true });
  await fs.writeFile(path.join(qaRoot, "validation.json"), `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const allSources = new Map();
  for (const slug of BALL_SLUGS) {
    for (const color of COLORS) allSources.set(`${slug}/${color}`, await readSource(slug, color));
  }

  const entries = [];
  let representative = null;
  for (const slug of BALL_SLUGS) {
    for (const color of COLORS) {
      const source = allSources.get(`${slug}/${color}`);
      const propFrames = source.frames.map((_, index) => propFrameFor(allSources, slug, color, index));
      if (propFrames.every((frame) => opaquePixelCount(frame) === 0)) {
        throw new Error(`${slug}/${color} has no safely separated prop pixels`);
      }
      const propSceneInsets = propTrajectoryInsets(propFrames);
      assertPropTrajectoryStartsAndEndsAtEdge(`${slug}/${color}`, propFrames, propSceneInsets);
      const actionFrames = source.frames.map((frame, index) =>
        frameWithoutProp(frame, propFrames[index]));
      const actionAtlas = paddedAtlas(actionFrames);
      // Keep the character centered. The separated prop starts at the 96px
      // scene edge, eases back to the legacy centered-source position at the
      // contact frame, then returns to the edge. This extends the travel without
      // moving the authored hit point away from the slime.
      const propAtlas = paddedAtlas(propFrames, COLUMNS, propSceneInsets);
      assertTransparentCellEdges(`${slug}/${color} action`, actionAtlas, FRAME_COUNT);
      assertTransparentCellEdges(`${slug}/${color} prop`, propAtlas, FRAME_COUNT, COLUMNS, true);
      const outputRoot = path.join(mobileRoot, slug, color);
      await writeOrCheck(path.join(outputRoot, "action-sheet.png"), await encodeAtlas(actionAtlas));
      await writeOrCheck(path.join(outputRoot, "prop-sheet.png"), await encodeAtlas(propAtlas));
      entries.push({
        slug,
        color,
        durations: source.durations,
        propSceneInsets,
        actionOpaquePixels: actionFrames.map(opaquePixelCount),
        propOpaquePixels: propFrames.map(opaquePixelCount),
      });
      if (slug === "soccer-ball" && color === "purple") {
        representative = { actionFrames, propFrames, propSceneInsets };
      }
    }
  }
  await writeOrCheck(registryPath, renderRegistry(entries));

  if (QA_MODE) {
    await writeQaContactSheet("soccer-purple-action-contact-sheet.png", representative.actionFrames);
    await writeQaContactSheet(
      "soccer-purple-prop-contact-sheet.png",
      representative.propFrames,
      representative.propSceneInsets,
    );
    await writeQaReport(entries);
  }
  console.log(
    `${CHECK_MODE ? "Validated" : "Generated"} ${entries.length} mobile ball actions at `
      + `${SCENE_FRAME_SIZE}px logical scene size${QA_MODE ? `; QA: ${path.relative(projectRoot, qaRoot)}` : ""}.`,
  );
}

await main();
