#!/usr/bin/env node

/**
 * Import the anchor-based slime composition package into the web and Expo
 * asset roots.
 *
 * The source package stores one overlay sheet per (role, option, timeline,
 * color) plus a per-frame `transforms` track of
 * `{ source_idle_frame, dx, dy }`. Two measured properties let this importer
 * store far less than the source does:
 *
 * 1. Wearable roles (`headwear`, `eyewear`, `blush`) have an `idle` sheet whose
 *    pixels and anchors are identical across all five slime colors, and every
 *    `drink-<flavor>` sheet is exactly that idle sheet replayed through its own
 *    anchor track. So one idle sheet plus anchor tracks reproduces every drink
 *    timeline; the drink sheets are never stored.
 * 2. The `drink` role has no idle timeline and uses identity anchors, but its
 *    pixels are color-sensitive (blue ramune drops highlight pixels on a blue
 *    slime), so its per-color sheets are preserved.
 *
 * Nothing is assumed. Property 1 is re-derived and byte-verified for every
 * frame at import time, and the import fails loudly when a source package stops
 * satisfying it. Anchor tracks stay per color because character silhouettes are
 * not perfectly aligned across colors.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(projectRoot, "public", "creatures", "slimes", "official", "composition");
const mobileRoot = path.join(projectRoot, "apps", "mobile", "assets", "slimes", "composition");
const webRegistryPath = path.join(projectRoot, "src", "lib", "pets", "slime-wearables.generated.ts");
const mobileRegistryPath = path.join(projectRoot, "apps", "mobile", "lib", "slime-wearables.generated.ts");

export const SLIME_COLORS = ["blue", "green", "purple", "red", "yellow"];

/**
 * Roles are ordered bottom-to-top exactly as the source contract declares.
 * `slime` is the character layer and is imported by import-slime-assets.mjs;
 * this importer owns the overlay roles above it.
 */
export const WEARABLE_ROLES = ["blush", "eyewear", "headwear", "drink"];

/**
 * Roles whose drink timelines are reproducible from their idle sheet. The
 * `drink` role is excluded because it has no idle timeline of its own.
 */
export const IDLE_DERIVED_ROLES = new Set(["blush", "eyewear", "headwear"]);

/** Blush art is not production-ready; it is imported but not exposed. */
export const UNPUBLISHED_ROLES = new Set();

const CANVAS = { width: 64, height: 64 };

/**
 * Character timelines a wearable may be authored against.
 *
 * Every entry is declared here rather than inferred, so adding a new action is a
 * deliberate change with an explicit frame count and canvas. `canvasHeight`
 * differs for the jump timelines because their overlays are authored on a taller
 * canvas that leaves room for the slime to leave the ground.
 *
 * `derivesFrom` names the timeline whose stored sheet can supply this one's
 * pixels. Timelines that only reorder another timeline's frames store no sheet at
 * all, which is what keeps a new drink from requiring new wearable art.
 */
const TIMELINES = {
  idle: { frameCount: 8, canvasHeight: 64, derivesFrom: null, grounded: true },
  happy: { frameCount: 12, canvasHeight: 64, derivesFrom: null, grounded: true },
  "ball-hit": { frameCount: 18, canvasHeight: 64, derivesFrom: null, grounded: true },
  // Jump actions leave the floor, so their overlays are authored on a taller
  // canvas with headroom above the grounded pose. `characterOffsetY` is where the
  // character sheet sits inside that canvas; the runtime must shift the overlay
  // back by it so a jump wearable lines up with the 64px character viewport.
  "water-puddle": { frameCount: 26, canvasHeight: 81, derivesFrom: null, grounded: false, characterOffsetY: 17 },
  trampoline: { frameCount: 26, canvasHeight: 81, derivesFrom: null, grounded: false, characterOffsetY: 17 },
};

/** Drink timelines all replay the idle sheet, so a new flavor needs no new art. */
const DRINK_FRAME_COUNT = 8;

const IDLE_FRAME_COUNT = TIMELINES.idle.frameCount;
/** Retained name for the idle frame count, which most call sites still assume. */
const FRAME_COUNT = IDLE_FRAME_COUNT;

function timelineSpec(timeline) {
  if (timeline.startsWith("drink-") || timeline.startsWith("drink:")) {
    return {
      frameCount: DRINK_FRAME_COUNT,
      canvasHeight: CANVAS.height,
      derivesFrom: "idle",
      grounded: true,
    };
  }
  const spec = TIMELINES[timeline];
  if (!spec) throw new Error(`Unknown wearable timeline: ${timeline}`);
  return spec;
}

function frameCountFor(timeline) {
  return timelineSpec(timeline).frameCount;
}

function canvasHeightFor(timeline) {
  return timelineSpec(timeline).canvasHeight;
}

/**
 * Vertical offset of the character inside this timeline's overlay canvas.
 *
 * Zero for grounded actions, which share the character canvas. Positive for jump
 * actions, whose taller canvas places the grounded pose lower; the runtime
 * subtracts it so both families position identically.
 */
function characterOffsetYFor(timeline) {
  return timelineSpec(timeline).characterOffsetY ?? 0;
}

function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write slime wearables outside the project: ${outputRoot}`);
  }
}

const toPosix = (value) => value.split(path.sep).join("/");

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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/** Map a source timeline directory name to the runtime timeline key. */
function timelineKey(timeline) {
  return timeline.startsWith("drink-") ? timeline.replace(/^drink-/, "drink:") : timeline;
}

/** Decode one sheet into per-frame maps of opaque pixels for exact comparison. */
async function decodeFrames(buffer, relative, frameCount, canvasHeight = CANVAS.height) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const expectedWidth = CANVAS.width * frameCount;
  if (info.width !== expectedWidth || info.height !== canvasHeight) {
    throw new Error(
      `Unexpected sheet dimensions for ${relative}: ${info.width}x${info.height}, ` +
        `expected ${expectedWidth}x${canvasHeight}`,
    );
  }
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pixels = new Map();
    for (let y = 0; y < canvasHeight; y += 1) {
      for (let x = 0; x < CANVAS.width; x += 1) {
        const sheetX = frameIndex * CANVAS.width + x;
        const offset = (y * info.width + sheetX) * 4;
        if (data[offset + 3] === 0) continue;
        pixels.set(
          `${x},${y}`,
          `${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`,
        );
      }
    }
    frames.push(pixels);
  }
  return frames;
}

/** Apply one anchor transform to a decoded frame. */
function applyTransform(frame, transform) {
  const moved = new Map();
  for (const [position, color] of frame) {
    const [x, y] = position.split(",").map(Number);
    moved.set(`${x + transform.dx},${y + transform.dy}`, color);
  }
  return moved;
}

function framesEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [position, color] of a) {
    if (b.get(position) !== color) return false;
  }
  return true;
}

function parseTransforms(relative, meta, frameCount) {
  if (!Array.isArray(meta.transforms)) {
    throw new Error(`Missing meta.transforms in ${relative}`);
  }
  if (meta.transforms.length !== frameCount) {
    throw new Error(
      `Expected ${frameCount} transforms in ${relative}, found ${meta.transforms.length}`,
    );
  }
  return meta.transforms.map((transform, index) => {
    for (const field of ["source_idle_frame", "dx", "dy"]) {
      if (!Number.isSafeInteger(transform?.[field])) {
        throw new Error(`Invalid transforms[${index}].${field} in ${relative}`);
      }
    }
    const sourceFrame = transform.source_idle_frame;
    if (sourceFrame < 0 || sourceFrame >= frameCount) {
      throw new Error(
        `transforms[${index}].source_idle_frame out of range in ${relative}: ${sourceFrame}`,
      );
    }
    return { sourceFrame, dx: transform.dx, dy: transform.dy };
  });
}

function parseSheetMetadata(relative, parsed, frameCount, canvasHeight = CANVAS.height) {
  if (!Array.isArray(parsed?.frames) || !parsed?.meta) {
    throw new Error(`Invalid composition JSON schema: ${relative}`);
  }
  const { meta } = parsed;
  if (meta.frame_count !== frameCount || parsed.frames.length !== frameCount) {
    throw new Error(`Expected ${frameCount} frames in ${relative}`);
  }
  if (meta.frame_size?.w !== CANVAS.width || meta.frame_size?.h !== canvasHeight) {
    throw new Error(
      `Unexpected frame size in ${relative}: expected ${CANVAS.width}x${canvasHeight}`,
    );
  }
  if (meta.size?.w !== CANVAS.width * frameCount || meta.size?.h !== canvasHeight) {
    throw new Error(`Unexpected sheet size in ${relative}`);
  }
  const durations = parsed.frames.map((frame, index) => {
    if (!Number.isFinite(frame?.duration) || frame.duration < 0) {
      throw new Error(`Invalid frame ${index} duration in ${relative}`);
    }
    return frame.duration;
  });
  return { durations, transforms: parseTransforms(relative, meta, frameCount), meta };
}

/** Read every color variant of one (role, option, timeline) cell. */
async function readTimelineCell(overlaysRoot, labelRoot, role, option, timeline) {
  const cellDir = path.join(overlaysRoot, role, option, timeline);
  const frameCount = frameCountFor(timeline);
  const canvasHeight = canvasHeightFor(timeline);
  const variants = [];
  for (const color of SLIME_COLORS) {
    const pngPath = path.join(cellDir, `${color}.png`);
    const jsonPath = path.join(cellDir, `${color}.json`);
    if (!(await exists(pngPath)) || !(await exists(jsonPath))) continue;
    const relative = toPosix(path.relative(labelRoot, jsonPath));
    const buffer = await fs.readFile(pngPath);
    const parsed = parseSheetMetadata(relative, await readJson(jsonPath), frameCount, canvasHeight);
    variants.push({ color, buffer, digest: sha256(buffer), relative, ...parsed });
  }
  if (variants.length === 0) return null;
  if (variants.length !== SLIME_COLORS.length) {
    throw new Error(
      `Incomplete color coverage for ${role}/${option}/${timeline}: ${variants.map((v) => v.color).join(", ")}`,
    );
  }

  const durationSets = new Set(variants.map((variant) => JSON.stringify(variant.durations)));
  if (durationSets.size !== 1) {
    throw new Error(`Frame durations differ across colors for ${role}/${option}/${timeline}`);
  }

  return { role, option, timeline, key: timelineKey(timeline), frameCount, canvasHeight, variants };
}

/**
 * Emit the sheet metadata the mobile asset validator pairs with every PNG.
 *
 * Anchor data lives in the generated registry, but the on-disk validator checks
 * PNG/JSON pairs without evaluating the Metro registry, so each sheet carries
 * its own frame rectangles and durations.
 */
function sheetMetadata(durations, canvasHeight = CANVAS.height) {
  return {
    frames: durations.map((duration, index) => ({
      filename: `${index}`,
      frame: { x: index * CANVAS.width, y: 0, w: CANVAS.width, h: canvasHeight },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: CANVAS.width, h: canvasHeight },
      sourceSize: { w: CANVAS.width, h: canvasHeight },
      duration,
    })),
    meta: {
      image: "sheet.png",
      format: "RGBA8888",
      size: { w: CANVAS.width * durations.length, h: canvasHeight },
      scale: "1",
    },
  };
}

function anchorTrackKey(transforms) {
  return transforms.map((t) => `${t.sourceFrame}:${t.dx}:${t.dy}`).join("|");
}

/**
 * Verify that a wearable option is fully reproducible from its idle sheet.
 *
 * For every color, timeline, and frame this recomputes
 * `idle[transform.sourceFrame]` shifted by `(dx, dy)` and compares it to the
 * authored sheet pixel for pixel. Only after that holds everywhere does the
 * importer drop the derived drink sheets.
 */
async function verifyIdleDerivation(role, option, idleCell, derivedCells) {
  const idleFramesByColor = new Map();
  for (const variant of idleCell.variants) {
    idleFramesByColor.set(
      variant.color,
      await decodeFrames(variant.buffer, variant.relative, idleCell.frameCount, idleCell.canvasHeight),
    );
  }

  let verifiedFrames = 0;
  for (const cell of derivedCells) {
    for (const variant of cell.variants) {
      const idleFrames = idleFramesByColor.get(variant.color);
      const authored = await decodeFrames(
        variant.buffer,
        variant.relative,
        cell.frameCount,
        cell.canvasHeight,
      );
      for (let index = 0; index < cell.frameCount; index += 1) {
        const transform = variant.transforms[index];
        const expected = applyTransform(idleFrames[transform.sourceFrame], transform);
        if (!framesEqual(expected, authored[index])) {
          throw new Error(
            `${role}/${option} ${cell.timeline} (${variant.color}) frame ${index} is not reproducible ` +
              "from its idle sheet and anchor track. The idle-derived invariant no longer holds; " +
              "update this importer deliberately.",
          );
        }
        verifiedFrames += 1;
      }
    }
  }
  return verifiedFrames;
}

/**
 * Build one runtime entry per (role, option).
 *
 * Each timeline records its anchor tracks and names the stored sheet it reads
 * from. Timelines that share a frame count with `idle` are derived from the idle
 * sheet; a timeline with its own frame count, such as `happy`, keeps its own
 * sheet because idle frames cannot address it.
 */
function buildEntry(role, option, cells) {
  const timelines = {};
  const sheets = new Map();
  const present = new Set(cells.map((cell) => cell.timeline));
  for (const cell of cells) {
    const tracks = new Map();
    for (const variant of cell.variants) tracks.set(variant.color, variant.transforms);
    // A timeline that only replays another timeline's frames stores no sheet of
    // its own. That is what lets a new drink flavor ship as an anchor track with
    // no new wearable art.
    const derivesFrom = timelineSpec(cell.timeline).derivesFrom;
    const sheetTimeline = derivesFrom && present.has(derivesFrom) ? derivesFrom : cell.timeline;
    timelines[cell.key] = {
      sheet: sheetTimeline,
      tracksByColor: Object.fromEntries(SLIME_COLORS.map((color) => [color, tracks.get(color)])),
    };
    if (sheetTimeline === cell.timeline) {
      sheets.set(cell.timeline, {
        durations: cell.variants[0].durations,
        frameCount: cell.frameCount,
        canvasHeight: cell.canvasHeight,
        buffersByColor: Object.fromEntries(cell.variants.map((v) => [v.color, v.buffer])),
      });
    }
  }
  return { role, option, key: `${role}/${option}`, timelines, sheets };
}

/**
 * Assert the anchor/sheet contract for one entry before it reaches the registry.
 *
 * These are the invariants the runtime relies on: every color agrees on track
 * length, every referenced sheet exists, and no anchor points past the columns
 * its sheet actually has.
 */
function validateEntry(entry) {
  for (const [key, timeline] of Object.entries(entry.timelines)) {
    const sheet = entry.sheets.get(timeline.sheet);
    if (!sheet) {
      throw new Error(`${entry.key} timeline ${key} references missing sheet ${timeline.sheet}`);
    }
    const lengths = new Set(SLIME_COLORS.map((color) => timeline.tracksByColor[color]?.length));
    if (lengths.size !== 1 || lengths.has(undefined)) {
      throw new Error(`${entry.key} timeline ${key} has inconsistent anchor track lengths across colors`);
    }
    const expectedLength = frameCountFor(key);
    const [trackLength] = [...lengths];
    if (trackLength !== expectedLength) {
      throw new Error(
        `${entry.key} timeline ${key} has ${trackLength} anchors, expected ${expectedLength} ` +
          "to match the character action",
      );
    }
    for (const color of SLIME_COLORS) {
      for (const anchor of timeline.tracksByColor[color]) {
        if (anchor.sourceFrame >= sheet.frameCount) {
          throw new Error(
            `${entry.key} timeline ${key} (${color}) addresses source frame ${anchor.sourceFrame} ` +
              `but sheet ${timeline.sheet} has only ${sheet.frameCount} columns`,
          );
        }
      }
    }
  }
  for (const [timeline, sheet] of entry.sheets) {
    if (sheet.durations.length !== sheet.frameCount) {
      throw new Error(`${entry.key} sheet ${timeline} has ${sheet.durations.length} durations for ${sheet.frameCount} frames`);
    }
    if (sheet.canvasHeight !== canvasHeightFor(timeline)) {
      throw new Error(
        `${entry.key} sheet ${timeline} has canvas height ${sheet.canvasHeight}, ` +
          `expected ${canvasHeightFor(timeline)}`,
      );
    }
  }
  return entry;
}

async function generateNearestFourX(buffer, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Unable to read overlay dimensions");
  await image
    .resize({
      width: metadata.width * 4,
      height: metadata.height * 4,
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toFile(target);
}

function tsLiteral(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * Anchor tracks are emitted once when every color agrees, with per-color
 * overrides only for the colors that genuinely deviate. This keeps the
 * generated registry small without losing authored precision.
 */
function timelinePayload(timeline) {
  const { tracksByColor } = timeline;
  const byTrack = new Map();
  for (const color of SLIME_COLORS) {
    const key = anchorTrackKey(tracksByColor[color]);
    if (!byTrack.has(key)) byTrack.set(key, { track: tracksByColor[color], colors: [] });
    byTrack.get(key).colors.push(color);
  }
  const ranked = [...byTrack.values()].sort((a, b) => b.colors.length - a.colors.length);
  const overrides = {};
  for (const group of ranked.slice(1)) {
    for (const color of group.colors) overrides[color] = group.track;
  }
  const payload = { sheet: timeline.sheet, anchors: ranked[0].track };
  if (Object.keys(overrides).length > 0) payload.anchorOverridesByColor = overrides;
  return payload;
}

function entryLiteral(entry, sheetsField) {
  return {
    key: entry.key,
    role: entry.role,
    option: entry.option,
    /**
     * Whether the option is offered in the shop. Growth-awarded crowns arrive
     * through a vendored bridge and are never purchasable; the gameplay award
     * rule itself lives in the repository stage map, not in asset naming.
     */
    published: !UNPUBLISHED_ROLES.has(entry.role) && !entry.vendored,
    vendoredSource: Boolean(entry.vendored),
    /** Layer index within the source contract order, character layer excluded. */
    zIndex: WEARABLE_ROLES.indexOf(entry.role) + 1,
    colorSensitive: !IDLE_DERIVED_ROLES.has(entry.role),
    ...sheetsField,
    timelines: Object.fromEntries(
      Object.entries(entry.timelines)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, timeline]) => [key, timelinePayload(timeline)]),
    ),
  };
}

/**
 * Stored sheets keyed by the timeline that owns them. Color-sensitive roles keep
 * one sheet per color; every other role shares a single color-independent sheet.
 */
function webSheetsField(entry) {
  const base = `/creatures/slimes/official/composition/${entry.role}/${entry.option}`;
  const colorSensitive = !IDLE_DERIVED_ROLES.has(entry.role);
  return {
    sheets: Object.fromEntries(
      [...entry.sheets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([timeline, sheet]) => [
        timeline,
        {
          frameCount: sheet.frameCount,
          frameSize: { w: CANVAS.width, h: sheet.canvasHeight },
          /** Subtract this to map the overlay canvas onto the character viewport. */
          characterOffsetY: characterOffsetYFor(timeline),
          grounded: timelineSpec(timeline).grounded,
          ...(colorSensitive
            ? {
                urlByColor: Object.fromEntries(
                  SLIME_COLORS.map((color) => [color, `${base}/${timeline}/${color}/sheet.png`]),
                ),
              }
            : { url: `${base}/${timeline}/sheet.png` }),
        },
      ]),
    ),
  };
}

function renderWebRegistry(entries) {
  const code = entries
    .map((entry) => `  ${JSON.stringify(entry.key)}: ${tsLiteral(entryLiteral(entry, webSheetsField(entry)))},`)
    .join("\n");
  return [
    "// Generated by scripts/import-slime-wearables.mjs. Do not edit by hand.",
    "",
    `export const SLIME_WEB_WEARABLE_REGISTRY = {\n${code}\n} as const;`,
    "",
    `export const SLIME_WEARABLE_LAYER_ORDER = ${tsLiteral(["slime", ...WEARABLE_ROLES])} as const;`,
    "",
  ].join("\n");
}

function renderMobileRegistry(entries) {
  const code = entries
    .map((entry) => {
      const base = `../assets/slimes/composition/${entry.role}/${entry.option}`;
      const literal = tsLiteral({ ...entryLiteral(entry, {}), imageScale: 4 });
      const colorSensitive = !IDLE_DERIVED_ROLES.has(entry.role);
      const sheets = [...entry.sheets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([timeline, sheet]) => {
          const image = colorSensitive
            ? `imageByColor: { ${SLIME_COLORS.map(
                (color) => `${color}: require(${JSON.stringify(`${base}/${timeline}/${color}/sheet.png`)})`,
              ).join(", ")} }`
            : `image: require(${JSON.stringify(`${base}/${timeline}/sheet.png`)})`;
          return (
            `${JSON.stringify(timeline)}: { frameCount: ${sheet.frameCount}, ` +
            `frameSize: { w: ${CANVAS.width}, h: ${sheet.canvasHeight} }, ` +
            `characterOffsetY: ${characterOffsetYFor(timeline)}, ` +
            `grounded: ${timelineSpec(timeline).grounded}, ${image} }`
          );
        })
        .join(", ");
      return `  ${JSON.stringify(entry.key)}: { ...${literal}, sheets: { ${sheets} } },`;
    })
    .join("\n");
  return [
    "// Generated by scripts/import-slime-wearables.mjs. Do not edit by hand.",
    "",
    `export const SLIME_MOBILE_WEARABLE_REGISTRY = {\n${code}\n} as const;`,
    "",
    `export const SLIME_WEARABLE_LAYER_ORDER = ${tsLiteral(["slime", ...WEARABLE_ROLES])} as const;`,
    "",
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  const positional = [];
  let extraOverlaysArgument = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      console.error(
        "Usage: node scripts/import-slime-wearables.mjs <SlimeAssets/props/composition> " +
          "[--extra-overlays <overlays-root>]",
      );
      return;
    }
    if (value === "--extra-overlays") {
      extraOverlaysArgument = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    positional.push(value);
  }
  const sourceArgument = positional[0];
  if (!sourceArgument || positional.length !== 1 || extraOverlaysArgument === null && argv.includes("--extra-overlays")) {
    console.error(
      "Usage: node scripts/import-slime-wearables.mjs <SlimeAssets/props/composition> " +
        "[--extra-overlays <overlays-root>]",
    );
    process.exitCode = 2;
    return;
  }

  const sourceRoot = path.resolve(sourceArgument);
  const sourceStat = await fs.stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error(`Composition source directory does not exist: ${sourceRoot}`);
  }
  const sourceRealRoot = await fs.realpath(sourceRoot);
  const projectRealRoot = await fs.realpath(projectRoot);
  if (
    sourceRealRoot === projectRealRoot ||
    sourceRealRoot.startsWith(`${projectRealRoot}${path.sep}`)
  ) {
    throw new Error("Composition source must be external to the project runtime roots");
  }

  const contract = await readJson(path.join(sourceRoot, "contract.json"));
  if (contract.canvas?.width !== CANVAS.width || contract.canvas?.height !== CANVAS.height) {
    throw new Error("Composition contract canvas does not match the expected 64x64 viewport");
  }
  if (contract.frames !== FRAME_COUNT) {
    throw new Error(`Composition contract declares ${contract.frames} frames, expected ${FRAME_COUNT}`);
  }
  const contractOrder = contract.layers_bottom_to_top ?? [];
  const expectedOrder = ["slime", ...WEARABLE_ROLES];
  if (JSON.stringify(contractOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      `Composition contract layer order changed: ${contractOrder.join(" -> ")}. ` +
        `This importer expects ${expectedOrder.join(" -> ")}.`,
    );
  }

  const overlaysRoot = path.join(sourceRoot, "overlays");
  /**
   * Optional additional overlay roots, used while a wearable family lives in a
   * vendored bridge package instead of the external asset package. They share
   * the external layout, so discovery and validation are identical.
   */
  const extraOverlayRoots = [];
  if (extraOverlaysArgument) {
    const extraRoot = path.resolve(extraOverlaysArgument);
    const extraStat = await fs.stat(extraRoot).catch(() => null);
    if (!extraStat?.isDirectory()) {
      throw new Error(`Extra overlay root does not exist: ${extraRoot}`);
    }
    extraOverlayRoots.push(extraRoot);
  }
  const discoveredRoles = await listDirectories(overlaysRoot);
  const unknownRoles = discoveredRoles.filter((role) => !WEARABLE_ROLES.includes(role));
  if (unknownRoles.length > 0) {
    throw new Error(`Unknown overlay roles in source package: ${unknownRoles.join(", ")}`);
  }

  // The source catalog is the authority on which options and timelines must
  // exist. Directory discovery alone would let a wholly missing timeline vanish
  // from the registry, silently hiding a wearable for one drink.
  const catalog = await readJson(path.join(sourceRoot, "catalog.json"));
  const expectedOptions = catalog.options ?? {};
  const expectedTimelines = catalog.timelines ?? [];
  const expectedColors = catalog.colors ?? [];
  if (JSON.stringify([...expectedColors].sort()) !== JSON.stringify([...SLIME_COLORS].sort())) {
    throw new Error(
      `Composition catalog colors changed: ${expectedColors.join(", ")}. ` +
        `This importer expects ${SLIME_COLORS.join(", ")}.`,
    );
  }
  /**
   * Options contributed by a vendored bridge root, keyed by role. They are not
   * in the external catalog yet, so they are validated against the bridge rather
   * than treated as undeclared.
   */
  const extraTimelinesByOption = new Map();
  for (const extraRoot of extraOverlayRoots) {
    for (const role of await listDirectories(extraRoot)) {
      if (!WEARABLE_ROLES.includes(role)) {
        throw new Error(`Unknown overlay role in extra source ${extraRoot}: ${role}`);
      }
      for (const option of await listDirectories(path.join(extraRoot, role))) {
        const timelines = await listDirectories(path.join(extraRoot, role, option));
        extraTimelinesByOption.set(`${role}/${option}`, { root: extraRoot, timelines });
      }
    }
  }

  for (const role of WEARABLE_ROLES) {
    const options = expectedOptions[role];
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error(`Composition catalog declares no options for role ${role}`);
    }
    const present = await listDirectories(path.join(overlaysRoot, role));
    const missing = options.filter((option) => !present.includes(option));
    if (missing.length > 0) {
      throw new Error(`Missing ${role} option directories: ${missing.join(", ")}`);
    }
    const unexpected = present.filter((option) => !options.includes(option));
    if (unexpected.length > 0) {
      throw new Error(`Undeclared ${role} option directories: ${unexpected.join(", ")}`);
    }
    // The bridge may add timelines to a catalog option (a jump track for an
    // existing hat), but it must never redeclare a timeline the catalog already
    // publishes, or the two sources would silently compete.
    for (const option of options) {
      const extra = extraTimelinesByOption.get(`${role}/${option}`);
      if (!extra) continue;
      const published = await listDirectories(path.join(overlaysRoot, role, option));
      const collisions = extra.timelines.filter((timeline) => published.includes(timeline));
      if (collisions.length > 0) {
        throw new Error(
          `Extra overlay source redeclares published ${role}/${option} timelines: ${collisions.join(", ")}. ` +
            "Delete the vendored bridge entry once the external package publishes it.",
        );
      }
    }
  }

  const entries = [];
  let verifiedFrameCount = 0;
  const droppedDerivedSheets = [];
  for (const role of WEARABLE_ROLES) {
    if (!discoveredRoles.includes(role)) continue;
    // One option may draw timelines from the published catalog and from the
    // vendored bridge at once: an authored hat gets its idle and drink tracks from
    // the catalog and its jump tracks from the bridge.
    const optionRoots = new Map();
    const roots = [overlaysRoot, ...extraOverlayRoots];
    for (const root of roots) {
      if (!(await exists(path.join(root, role)))) continue;
      for (const option of await listDirectories(path.join(root, role))) {
        const existing = optionRoots.get(option) ?? [];
        existing.push(root);
        optionRoots.set(option, existing);
      }
    }

    for (const [option, sources] of [...optionRoots.entries()].sort()) {
      const cells = [];
      const seen = new Set();
      for (const root of sources) {
        for (const timeline of await listDirectories(path.join(root, role, option))) {
          if (seen.has(timeline)) continue;
          const cell = await readTimelineCell(root, root, role, option, timeline);
          if (!cell) continue;
          seen.add(timeline);
          cells.push(cell);
        }
      }
      if (cells.length === 0) continue;
      // Catalog-published options must satisfy the full contract; bridge-only
      // options (the growth crowns) are validated against what they carry.
      const fromCatalog = sources.includes(overlaysRoot);

      if (IDLE_DERIVED_ROLES.has(role)) {
        // Catalog options must cover the idle timeline plus every declared drink.
        // Actions beyond that (happy, the two jump floors, ball-hit) are optional:
        // an option without them has its head layer suppressed for that action
        // rather than blocking the import.
        const requiredTimelines = fromCatalog ? expectedTimelines : ["idle"];
        const presentTimelines = cells.map((cell) => cell.timeline);
        const missingTimelines = requiredTimelines.filter(
          (timeline) => !presentTimelines.includes(timeline),
        );
        if (missingTimelines.length > 0) {
          throw new Error(
            `${role}/${option} is missing timelines: ${missingTimelines.join(", ")}`,
          );
        }
        const idleCell = cells.find((cell) => cell.timeline === "idle");
        if (!idleCell) {
          throw new Error(`Wearable option ${role}/${option} has no idle timeline to derive from`);
        }
        const idleDigests = new Set(idleCell.variants.map((variant) => variant.digest));
        if (idleDigests.size !== 1) {
          throw new Error(
            `Idle overlay pixels differ across colors for ${role}/${option}. ` +
              "The color dimension can no longer be collapsed; update this importer deliberately.",
          );
        }
        // Only timelines declared as replaying the idle sheet are derived; the
        // rest keep their own sheet, so there is nothing to verify.
        const derived = cells.filter(
          (cell) => timelineSpec(cell.timeline).derivesFrom === "idle" && cell.timeline !== "idle",
        );
        verifiedFrameCount += await verifyIdleDerivation(role, option, idleCell, derived);
        droppedDerivedSheets.push(...derived.map((cell) => `${role}/${option}/${cell.timeline}`));
        const entry = buildEntry(role, option, cells);
        entry.vendored = !fromCatalog;
        entries.push(validateEntry(entry));
        continue;
      }

      const entry = buildEntry(role, option, cells);
      if (cells.length !== 1) {
        throw new Error(
          `Color-sensitive role ${role}/${option} must declare exactly one timeline, found ${cells.length}`,
        );
      }
      // A drink option's only timeline must be its own flavor.
      if (cells[0].timeline !== `drink-${option}`) {
        throw new Error(
          `Drink option ${option} declares timeline ${cells[0].timeline}, expected drink-${option}`,
        );
      }
      entries.push(validateEntry(entry));
    }
  }

  if (entries.length === 0) throw new Error("No overlay entries were discovered");

  /**
   * Growth crowns are recovered from legacy crowned sheets and therefore only
   * carry authored idle/happy pixels. Their drink motion is not new crown art:
   * every ordinary headwear option uses the same flavor-specific character
   * anchor track while replaying its own idle sheet. Assert that shared contract
   * first, then attach those tracks to each vendored crown explicitly.
   */
  const drinkTimelineKeys = expectedTimelines
    .filter((timeline) => timeline.startsWith("drink-"))
    .map(timelineKey);
  const catalogHeadwear = entries.filter(
    (entry) => entry.role === "headwear" && !entry.vendored,
  );
  for (const key of drinkTimelineKeys) {
    const candidates = catalogHeadwear
      .map((entry) => entry.timelines[key])
      .filter(Boolean);
    if (candidates.length === 0) {
      throw new Error(`No published headwear supplies the shared ${key} anchor track`);
    }
    const signatures = new Set(
      candidates.map((timeline) => JSON.stringify(timeline.tracksByColor)),
    );
    if (signatures.size !== 1) {
      throw new Error(
        `Published headwear disagrees on the shared ${key} anchor track; ` +
          "growth crowns cannot derive it safely",
      );
    }
    const sharedTracks = candidates[0].tracksByColor;
    for (const crown of entries.filter(
      (entry) => entry.role === "headwear" && entry.vendored,
    )) {
      crown.timelines[key] = {
        sheet: "idle",
        tracksByColor: Object.fromEntries(
          SLIME_COLORS.map((color) => [
            color,
            sharedTracks[color].map((anchor) => ({ ...anchor })),
          ]),
        ),
      };
      validateEntry(crown);
    }
  }

  assertProjectOutput(webRoot);
  assertProjectOutput(mobileRoot);
  // Clean only the option directories this importer owns. The crown importer
  // writes additional headwear options into the same tree, so wiping the whole
  // composition root here would make the two scripts order-dependent.
  for (const entry of entries) {
    for (const root of [webRoot, mobileRoot]) {
      const owned = path.join(root, entry.role, entry.option);
      assertProjectOutput(owned);
      await fs.rm(owned, { recursive: true, force: true });
    }
  }

  let writtenSheets = 0;
  for (const entry of entries) {
    const colorSensitive = !IDLE_DERIVED_ROLES.has(entry.role);
    for (const [timeline, sheet] of entry.sheets) {
      const metadata = sheetMetadata(sheet.durations, sheet.canvasHeight);
      // Color-independent roles collapse to one sheet per timeline; the
      // color-sensitive drink role keeps a sheet per color.
      const targets = colorSensitive
        ? SLIME_COLORS.map((color) => [
            path.join(entry.role, entry.option, timeline, color),
            sheet.buffersByColor[color],
          ])
        : [[path.join(entry.role, entry.option, timeline), Object.values(sheet.buffersByColor)[0]]];
      for (const [relativeDir, buffer] of targets) {
        const webDir = path.join(webRoot, relativeDir);
        await fs.mkdir(webDir, { recursive: true });
        await fs.writeFile(path.join(webDir, "sheet.png"), buffer);
        await writeJson(path.join(webDir, "sheet.json"), metadata);
        await generateNearestFourX(buffer, path.join(mobileRoot, relativeDir, "sheet.png"));
        await writeJson(path.join(mobileRoot, relativeDir, "sheet.json"), metadata);
        writtenSheets += 1;
      }
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));
  await fs.writeFile(webRegistryPath, renderWebRegistry(entries), "utf8");
  await fs.writeFile(mobileRegistryPath, renderMobileRegistry(entries), "utf8");

  const sourceOverlayFiles = entries.reduce(
    (total, entry) => total + Object.keys(entry.timelines).length * SLIME_COLORS.length,
    0,
  );
  const anchorOverrides = entries.flatMap((entry) =>
    Object.entries(entry.timelines).flatMap(([key, timeline]) => {
      const payload = timelinePayload(timeline);
      return Object.keys(payload.anchorOverridesByColor ?? {}).map(
        (color) => `${entry.key} ${key} (${color})`,
      );
    }),
  );
  const report = {
    source: sourceRoot,
    sourceOverlayFiles,
    importedSheets: writtenSheets,
    reductionRatio: Number((writtenSheets / sourceOverlayFiles).toFixed(4)),
    verifiedDerivedFrames: verifiedFrameCount,
    droppedDerivedSheets: droppedDerivedSheets.length,
    byRole: Object.fromEntries(
      WEARABLE_ROLES.map((role) => [role, entries.filter((entry) => entry.role === role).length]),
    ),
    publishedRoles: WEARABLE_ROLES.filter((role) => !UNPUBLISHED_ROLES.has(role)),
    unpublishedRoles: [...UNPUBLISHED_ROLES],
    anchorOverrides,
    generated: {
      webRoot: toPosix(path.relative(projectRoot, webRoot)),
      mobileRoot: toPosix(path.relative(projectRoot, mobileRoot)),
      webRegistry: toPosix(path.relative(projectRoot, webRegistryPath)),
      mobileRegistry: toPosix(path.relative(projectRoot, mobileRegistryPath)),
    },
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
