#!/usr/bin/env node

/**
 * Import the SlimeAssets source package into the web and Expo asset roots.
 *
 * The source directory is deliberately a command-line input.  Generated
 * registries contain only project-local URLs and relative Metro requires, so
 * the source package is never a runtime dependency.
 */

import { promises as fs } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const execFile = promisify(execFileCallback);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalWebRoot = path.join(projectRoot, "public", "creatures", "slimes", "official");
const canonicalMobileRoot = path.join(projectRoot, "apps", "mobile", "assets", "slimes");
let webRoot = canonicalWebRoot;
let mobileRoot = canonicalMobileRoot;

async function pathExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

/**
 * Replace a related set of files/directories as one rollback-capable publish.
 *
 * Every source is already complete in staging. Existing targets are first moved
 * under that same staging root; if any install rename fails, installed targets
 * are removed and all originals are restored before the error escapes.
 */
async function publishStagedOutputs(items, stagingRoot) {
  const backupRoot = path.join(stagingRoot, "rollback");
  await fs.mkdir(backupRoot, { recursive: true });
  const movedBackups = [];
  const installed = [];
  try {
    for (const [index, item] of items.entries()) {
      await fs.mkdir(path.dirname(item.target), { recursive: true });
      if (!(await pathExists(item.target))) continue;
      const backup = path.join(backupRoot, String(index));
      await fs.rename(item.target, backup);
      movedBackups.push({ target: item.target, backup });
    }
    for (const item of items) {
      await fs.rename(item.source, item.target);
      installed.push(item.target);
    }
  } catch (error) {
    for (const target of installed.reverse()) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
    for (const item of movedBackups.reverse()) {
      await fs.rename(item.backup, item.target).catch(() => {});
    }
    throw error;
  }
  await fs.rm(backupRoot, { recursive: true, force: true });
}

function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to replace slime assets outside the project: ${outputRoot}`);
  }
}

export const SLIME_COLORS = ["blue", "green", "yellow", "purple", "red"];
export const SLIME_EVOLUTIONS = ["base", "gold-crown-red-gem", "silver-crown-blue-gem"];

/**
 * Drink flavors that ship their own character timeline.
 *
 * The drinking pose differs per flavor, so a single `drink` sheet cannot serve
 * them all. Importing one sheet per flavor is what stops a lemonade glass from
 * being baked into every drink animation.
 *
 * Names match the source package's own action naming (`drink-lemonade`), so the
 * registry key and the authored folder stay readable against each other.
 */
export const SLIME_DRINK_FLAVORS = [
  "lemonade",
  "strawberry-soda",
  "melon-soda",
  "grape-soda",
  "blue-ramune",
];

export const SLIME_DRINK_ACTIONS = SLIME_DRINK_FLAVORS.map((flavor) => `drink-${flavor}`);

export const SLIME_ACTIONS = [
  "idle",
  "happy",
  ...SLIME_DRINK_ACTIONS,
  "water-puddle",
  "trampoline",
];

export const SLIME_PLAYBACK_BY_ACTION = {
  idle: { loop: true, oneShot: false },
  happy: { loop: false, oneShot: true },
  ...Object.fromEntries(
    SLIME_DRINK_ACTIONS.map((action) => [action, { loop: false, oneShot: true }]),
  ),
  "water-puddle": { loop: false, oneShot: true },
  trampoline: { loop: false, oneShot: true },
};

/**
 * Which character sheets each evolution is expected to ship.
 *
 * `base` carries every action. The evolved packages never authored idle or
 * happy, and only ever authored a crowned lemonade among the drinks, so
 * requiring the other flavors there would fail on art that does not exist.
 *
 * Exported because the mobile asset check validates the same set on disk.
 * A new drink flavor changes what is required, so both callers derive it here
 * rather than repeating a hand-written list that can fall behind.
 */
export function slimeExpectedActionsForEvolution(evolution) {
  if (evolution === "base") return SLIME_ACTIONS;
  return SLIME_ACTIONS.filter(
    (action) =>
      action !== "idle" &&
      action !== "happy" &&
      (!action.startsWith("drink-") || action === "drink-lemonade"),
  );
}

const COLOR_SET = new Set(SLIME_COLORS);
const EVOLUTION_SET = new Set(SLIME_EVOLUTIONS);
const ACTION_SET = new Set(SLIME_ACTIONS);
const HAPPY_FRAME_COUNT = 12;
const HAPPY_CANVAS = { width: 64, height: 64 };
const HAPPY_LAYER_NAMES = { body: "슬라임", heart: "하트" };

const toPosix = (value) => value.split(path.sep).join("/");
const keyFor = ({ evolution, color, action }) => `${evolution}/${color}/${action}`;
const overlayKeyFor = ({ evolution, color }) => `${evolution}/${color}`;

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(root) {
  const result = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

function classifySpriteJson(sourceRoot, filePath) {
  const relative = toPosix(path.relative(sourceRoot, filePath));
  if (!relative.endsWith("-sheet.json")) return null;
  const parts = relative.split("/");
  const color = parts.find((part) => COLOR_SET.has(part));
  const crown = parts.find((part) => EVOLUTION_SET.has(part));
  const evolution = crown ?? "base";
  if (!color) return null;

  let action = null;
  if (parts.includes("characters") && parts.includes("idle")) action = "idle";
  else if (parts.includes("happy-heart-assets")) action = "happy";
  else if (parts.includes("water-puddle") && parts.includes("jump")) action = "water-puddle";
  else if (parts.includes("trampoline")) action = "trampoline";
  // The evolved package only ever authored a crowned lemonade sheet. It stays a
  // legacy fallback rather than standing in for every flavor.
  else if (parts.includes("crowned-drink-assets") && parts.includes("lemonade")) {
    action = "drink-lemonade";
  }
  else if (parts.includes("crowned-jump-assets") && (parts.includes("water-puddle") || parts.includes("trampoline"))) {
    action = parts.includes("water-puddle") ? "water-puddle" : "trampoline";
  }

  if (!action || !ACTION_SET.has(action)) return null;
  if (evolution !== "base" && action === "idle") return null;
  if (evolution !== "base" && action === "happy") return null;
  const stem = path.basename(filePath, "-sheet.json");
  const directory = path.dirname(filePath);
  return {
    sourceRoot,
    filePath,
    relative,
    evolution,
    color,
    action,
    key: keyFor({ evolution, color, action }),
    sheetPath: path.join(directory, `${stem}-sheet.png`),
    sheet4xPath: path.join(directory, `${stem}-sheet-4x.png`),
    projectPath: path.join(directory, `${stem}.aseprite`),
  };
}

/**
 * Classify a drink-free character timeline from the composition package.
 *
 * These live at `props/composition/base/drink-<flavor>/<color>/slime.json` and
 * carry no drink pixels, which is exactly what the anchor overlays need beneath
 * them. The legacy `props/drink/<flavor>` sheets have the drink baked in and are
 * deliberately not read here.
 */
function classifyCompositionBase(sourceRoot, filePath) {
  const relative = toPosix(path.relative(sourceRoot, filePath));
  const match = /^props\/composition\/base\/(drink-[a-z-]+)\/([a-z]+)\/slime\.json$/.exec(relative);
  if (!match) return null;
  const [, action, color] = match;
  if (!COLOR_SET.has(color) || !ACTION_SET.has(action)) return null;
  return {
    sourceRoot,
    filePath,
    relative,
    evolution: "base",
    color,
    action,
    key: keyFor({ evolution: "base", color, action }),
    // The composition package names its art `slime.png` rather than following the
    // legacy `*-sheet.png` convention.
    sheetPath: path.join(path.dirname(filePath), "slime.png"),
    sheet4xPath: path.join(path.dirname(filePath), "slime-4x.png"),
  };
}

function compareEntries(a, b) {
  const evolutionDelta = SLIME_EVOLUTIONS.indexOf(a.evolution) - SLIME_EVOLUTIONS.indexOf(b.evolution);
  if (evolutionDelta) return evolutionDelta;
  const colorDelta = SLIME_COLORS.indexOf(a.color) - SLIME_COLORS.indexOf(b.color);
  if (colorDelta) return colorDelta;
  return SLIME_ACTIONS.indexOf(a.action) - SLIME_ACTIONS.indexOf(b.action);
}

/**
 * Strip machine-local provenance out of imported sheet metadata.
 *
 * The composition package records the authoring `.aseprite` file as an absolute
 * path. Copying that through would put the asset author's home directory into a
 * generated registry and into published web assets, so paths under the source
 * package are rewritten relative to it and any other absolute path is dropped.
 */
function sanitizeMeta(meta, sourceRoot) {
  // No source package to relativize against (the Aseprite layer export writes
  // into a temp directory), so any absolute path is simply dropped.
  const sourcePrefix = sourceRoot ? `${toPosix(sourceRoot)}/` : null;
  const isAbsolute = (value) => /^([A-Za-z]:[\\/]|\/|\\\\)/.test(value);
  const sanitized = {};
  for (const [field, value] of Object.entries(meta)) {
    if (typeof value !== "string" || !isAbsolute(value)) {
      sanitized[field] = value;
      continue;
    }
    const posix = toPosix(value);
    if (sourcePrefix && posix.toLowerCase().startsWith(sourcePrefix.toLowerCase())) {
      sanitized[field] = posix.slice(sourcePrefix.length);
    }
    // A path outside the source package identifies nothing reproducible, so it
    // is omitted rather than published.
  }
  return sanitized;
}

function parseMetadata(relative, parsed, sourceRoot = null) {
  if (!parsed || typeof parsed !== "object" || !parsed.frames || typeof parsed.frames !== "object" || !parsed.meta || typeof parsed.meta !== "object") {
    throw new Error(`Invalid Aseprite JSON schema: ${relative}`);
  }
  const sourceFrames = Array.isArray(parsed.frames)
    ? parsed.frames.map((frame, index) => [String(frame?.filename ?? index), frame])
    : Object.entries(parsed.frames);
  const frames = sourceFrames.map(([filename, frame], index) => {
    if (!frame || typeof frame !== "object" || !frame.frame || typeof frame.frame !== "object") {
      throw new Error(`Invalid frame ${index} in ${relative}`);
    }
    const rect = frame.frame;
    for (const field of ["x", "y", "w", "h"]) {
      if (!Number.isSafeInteger(rect[field]) || rect[field] < 0) throw new Error(`Invalid frame.${field} in ${relative}`);
    }
    if (!Number.isFinite(frame.duration) || frame.duration < 0) throw new Error(`Invalid frame duration in ${relative}`);
    return {
      filename: String(frame.filename ?? filename ?? `${index}`),
      frame: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      rotated: Boolean(frame.rotated),
      trimmed: Boolean(frame.trimmed),
      spriteSourceSize: frame.spriteSourceSize ?? { x: 0, y: 0, w: rect.w, h: rect.h },
      sourceSize: frame.sourceSize ?? { w: rect.w, h: rect.h },
      duration: frame.duration,
    };
  });
  const meta = parsed.meta;
  if (!meta.size || !Number.isSafeInteger(meta.size.w) || !Number.isSafeInteger(meta.size.h)) {
    throw new Error(`Missing meta.size in ${relative}`);
  }
  return { frames, meta: sanitizeMeta(meta, sourceRoot) };
}

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function generateNearestFourX(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const image = sharp(source);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Unable to read image dimensions: ${source}`);
  await image.resize({ width: metadata.width * 4, height: metadata.height * 4, kernel: sharp.kernel.nearest }).png().toFile(target);
}

function asepriteBinary() {
  return process.env.ASEPRITE_BIN ?? process.env.ASEPRITE_PATH ?? "aseprite";
}

/**
 * Read the happy-heart overlays already on disk.
 *
 * Used when the Aseprite split is skipped, so the regenerated registry keeps
 * describing art that is still present rather than dropping it.
 */
async function readExistingHappyHeartOverlays() {
  const overlayRoot = path.join(webRoot, "overlays", "happy-heart");
  const evolutions = await fs.readdir(overlayRoot).catch(() => null);
  if (!evolutions) return [];
  const overlays = [];
  for (const evolution of evolutions.sort()) {
    const colors = await fs.readdir(path.join(overlayRoot, evolution)).catch(() => []);
    for (const color of colors.sort()) {
      const metadataPath = path.join(overlayRoot, evolution, color, "sheet.json");
      if (!(await exists(metadataPath))) continue;
      overlays.push({
        key: `${evolution}/${color}`,
        evolution,
        color,
        metadata: JSON.parse(await fs.readFile(metadataPath, "utf8")),
      });
    }
  }
  return overlays;
}

/** Whether the Aseprite CLI can actually be invoked on this machine. */
async function asepriteAvailable() {
  try {
    await execFile(asepriteBinary(), ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function exportAsepriteLayer(sourceProject, layerName, targetSheet, targetJson) {
  await fs.mkdir(path.dirname(targetSheet), { recursive: true });
  await execFile(
    asepriteBinary(),
    [
      "--batch",
      "--layer",
      layerName,
      sourceProject,
      "--sheet",
      targetSheet,
      "--data",
      targetJson,
      "--format",
      "json-array",
      "--sheet-type",
      "rows",
      "--sheet-columns",
      String(HAPPY_FRAME_COUNT),
    ],
    { windowsHide: true },
  );
}

async function readHappyLayerMetadata(relative, filePath) {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  const metadata = parseMetadata(relative, parsed);
  if (
    metadata.frames.length !== HAPPY_FRAME_COUNT
    || metadata.meta.size.w !== HAPPY_CANVAS.width * HAPPY_FRAME_COUNT
    || metadata.meta.size.h !== HAPPY_CANVAS.height
  ) {
    throw new Error(
      `Happy layer export has unexpected dimensions or frame count for ${relative}: `
      + `${metadata.meta.size.w}x${metadata.meta.size.h}, ${metadata.frames.length} frames`,
    );
  }
  return { frames: metadata.frames, meta: metadata.meta };
}

async function verifyHappyLayerComposition(sourceSheet, bodySheet, heartSheet, context) {
  const [source, body, heart] = await Promise.all(
    [sourceSheet, bodySheet, heartSheet].map((filePath) =>
      sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })),
  );
  if (
    source.info.width !== HAPPY_CANVAS.width * HAPPY_FRAME_COUNT
    || source.info.height !== HAPPY_CANVAS.height
    || body.info.width !== source.info.width
    || body.info.height !== source.info.height
    || heart.info.width !== source.info.width
    || heart.info.height !== source.info.height
  ) {
    throw new Error(`Happy layer export dimensions do not match for ${context}`);
  }

  let bodyPixels = 0;
  let heartPixels = 0;
  let mismatchedPixels = 0;
  for (let index = 0; index < source.data.length; index += 4) {
    const bodyAlpha = body.data[index + 3];
    const heartAlpha = heart.data[index + 3];
    if (bodyAlpha > 0) bodyPixels += 1;
    if (heartAlpha > 0) heartPixels += 1;

    const expected = heartAlpha > 0 ? heart.data : body.data;
    const expectedAlpha = heartAlpha > 0 ? heartAlpha : bodyAlpha;
    if (
      source.data[index] !== expected[index]
      || source.data[index + 1] !== expected[index + 1]
      || source.data[index + 2] !== expected[index + 2]
      || source.data[index + 3] !== expectedAlpha
    ) {
      mismatchedPixels += 1;
    }
  }
  if (heartPixels === 0 || bodyPixels === 0 || mismatchedPixels !== 0) {
    throw new Error(
      `Happy layer export failed composition verification for ${context}: `
      + `body=${bodyPixels}, heart=${heartPixels}, mismatched=${mismatchedPixels}`,
    );
  }
}

async function exportHappyLayers(sourceProject, sourceSheet, relative) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aura-slime-happy-"));
  const bodySheet = path.join(temporaryRoot, "body.png");
  const bodyJson = path.join(temporaryRoot, "body.json");
  const heartSheet = path.join(temporaryRoot, "heart.png");
  const heartJson = path.join(temporaryRoot, "heart.json");
  try {
    await exportAsepriteLayer(sourceProject, HAPPY_LAYER_NAMES.body, bodySheet, bodyJson);
    await exportAsepriteLayer(sourceProject, HAPPY_LAYER_NAMES.heart, heartSheet, heartJson);
    const [bodyMetadata, heartMetadata] = await Promise.all([
      readHappyLayerMetadata(`${relative} [${HAPPY_LAYER_NAMES.body}]`, bodyJson),
      readHappyLayerMetadata(`${relative} [${HAPPY_LAYER_NAMES.heart}]`, heartJson),
    ]);
    await verifyHappyLayerComposition(sourceSheet, bodySheet, heartSheet, relative);
    return { temporaryRoot, bodySheet, heartSheet, bodyMetadata, heartMetadata };
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    throw new Error(
      `Unable to extract happy layers from ${sourceProject}. `
      + `Set ASEPRITE_BIN to a compatible Aseprite executable. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function generateCrownOverlay(baseSheet, crownedSheet, targetWeb, targetMobile) {
  const [base, crowned] = await Promise.all([
    sharp(baseSheet).extract({ left: 0, top: 0, width: 64, height: 64 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(crownedSheet).extract({ left: 0, top: 0, width: 64, height: 64 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (base.info.channels !== 4 || crowned.info.channels !== 4) throw new Error("Crown overlay inputs must decode to RGBA");
  const output = Buffer.alloc(64 * 64 * 4);
  let differingPixels = 0;
  for (let index = 0; index < output.length; index += 4) {
    const different = base.data[index] !== crowned.data[index]
      || base.data[index + 1] !== crowned.data[index + 1]
      || base.data[index + 2] !== crowned.data[index + 2]
      || base.data[index + 3] !== crowned.data[index + 3];
    if (different) {
      output[index] = crowned.data[index];
      output[index + 1] = crowned.data[index + 1];
      output[index + 2] = crowned.data[index + 2];
      output[index + 3] = crowned.data[index + 3];
      differingPixels += 1;
    }
  }
  if (differingPixels === 0) throw new Error(`Crown overlay has no differing pixels: ${crownedSheet}`);
  const webBuffer = await sharp(output, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  await fs.mkdir(path.dirname(targetWeb), { recursive: true });
  await fs.writeFile(targetWeb, webBuffer);
  await generateNearestFourX(targetWeb, targetMobile);
  return { differingPixels };
}

function frameMetadataLiteral(metadata) {
  return metadata;
}

function tsLiteral(value) {
  return JSON.stringify(value, null, 2);
}

function webEntryLiteral(entry) {
  return {
    key: entry.key,
    evolution: entry.evolution,
    color: entry.color,
    action: entry.action,
    sheetUrl: `/creatures/slimes/official/${entry.key}/sheet.png`,
    metadata: frameMetadataLiteral(entry.metadata),
  };
}

function mobileEntryLiteral(entry) {
  return {
    key: entry.key,
    evolution: entry.evolution,
    color: entry.color,
    action: entry.action,
    sheetRequire: `../assets/slimes/${entry.key}/sheet.png`,
    imageScale: 4,
    metadata: frameMetadataLiteral(entry.metadata),
  };
}

function renderWebRegistry(entries, overlays, happyHeartOverlays, shared) {
  const entriesCode = entries.map((entry) => `  ${JSON.stringify(entry.key)}: ${tsLiteral(webEntryLiteral(entry))},`).join("\n");
  const overlaysCode = overlays.map((overlay) => `  ${JSON.stringify(overlay.key)}: ${tsLiteral({ key: overlay.key, imageUrl: `/creatures/slimes/official/overlays/${overlay.key}/overlay.png`, imageScale: 1, differingPixels: overlay.differingPixels })},`).join("\n");
  const happyHeartCode = happyHeartOverlays.map((overlay) => `  ${JSON.stringify(overlay.key)}: ${tsLiteral({ key: overlay.key, evolution: overlay.evolution, color: overlay.color, action: "happy", imageUrl: `/creatures/slimes/official/overlays/happy-heart/${overlay.key}/sheet.png`, imageScale: 1, metadata: overlay.metadata })},`).join("\n");
  return `// Generated by scripts/import-slime-assets.mjs. Do not edit by hand.\n\nexport const SLIME_WEB_ASSET_REGISTRY = {\n${entriesCode}\n} as const;\n\nexport const SLIME_WEB_CROWN_OVERLAY_REGISTRY = {\n${overlaysCode}\n} as const;\n\nexport const SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY = {\n${happyHeartCode}\n} as const;\n\nexport const SLIME_WEB_SHARED_ASSETS = ${tsLiteral(shared)} as const;\n`;
}

function renderMobileRegistry(entries, overlays, happyHeartOverlays, shared) {
  const entriesCode = entries.map((entry) => {
    const value = mobileEntryLiteral(entry);
    const { sheetRequire, ...literal } = value;
    return `  ${JSON.stringify(entry.key)}: { ...${tsLiteral(literal)}, sheet: require(${JSON.stringify(sheetRequire)}) },`;
  }).join("\n");
  const overlaysCode = overlays.map((overlay) => `  ${JSON.stringify(overlay.key)}: { key: ${JSON.stringify(overlay.key)}, imageScale: 4, differingPixels: ${overlay.differingPixels}, overlay: require(${JSON.stringify(`../assets/slimes/overlays/${overlay.key}/overlay.png`)}) },`).join("\n");
  const happyHeartCode = happyHeartOverlays.map((overlay) => `  ${JSON.stringify(overlay.key)}: { key: ${JSON.stringify(overlay.key)}, evolution: ${JSON.stringify(overlay.evolution)}, color: ${JSON.stringify(overlay.color)}, action: "happy", imageScale: 4, metadata: ${tsLiteral(overlay.metadata)}, sheet: require(${JSON.stringify(`../assets/slimes/overlays/happy-heart/${overlay.key}/sheet.png`)}) },`).join("\n");
  const sharedCode = {
    grassFloor: { key: "grass-floor", imageScale: 4, surfaceY: 44, slimeFootY: 56, source: "../assets/slimes/shared/grass-floor.png" },
    cookie: { key: "cookie-shop-icon-256", imageScale: 1, source: "../assets/slimes/shared/cookie-shop-icon-256.png" },
    sharedPuddle: shared.sharedPuddle ? { ...shared.sharedPuddle, source: "../assets/slimes/shared/water-puddle/sheet.png", imageScale: 4 } : null,
  };
  return `// Generated by scripts/import-slime-assets.mjs. Do not edit by hand.\n\nexport const SLIME_MOBILE_ASSET_REGISTRY = {\n${entriesCode}\n} as const;\n\nexport const SLIME_MOBILE_CROWN_OVERLAY_REGISTRY = {\n${overlaysCode}\n} as const;\n\nexport const SLIME_MOBILE_HAPPY_HEART_OVERLAY_REGISTRY = {\n${happyHeartCode}\n} as const;\n\nexport const SLIME_MOBILE_SHARED_ASSETS = {\n  grassFloor: { ...${tsLiteral(sharedCode.grassFloor)}, image: require(${JSON.stringify(sharedCode.grassFloor.source)}) },\n  cookie: { ...${tsLiteral(sharedCode.cookie)}, image: require(${JSON.stringify(sharedCode.cookie.source)}) },\n  sharedPuddle: ${sharedCode.sharedPuddle ? `{ ...${tsLiteral(sharedCode.sharedPuddle)}, image: require(${JSON.stringify(sharedCode.sharedPuddle.source)}) }` : "null"},\n} as const;\n\nexport const SLIME_MOBILE_ANIMATION_MANIFEST = {\n  schemaVersion: 1,\n  imageScale: 4,\n  colors: ${tsLiteral(SLIME_COLORS)},\n  evolutions: ${tsLiteral(SLIME_EVOLUTIONS)},\n  actions: ${tsLiteral(SLIME_ACTIONS)},\n  playbackByAction: ${tsLiteral(SLIME_PLAYBACK_BY_ACTION)},\n  assets: SLIME_MOBILE_ASSET_REGISTRY,\n  crownOverlays: SLIME_MOBILE_CROWN_OVERLAY_REGISTRY,\n  happyHeartOverlays: SLIME_MOBILE_HAPPY_HEART_OVERLAY_REGISTRY,\n  shared: SLIME_MOBILE_SHARED_ASSETS,\n} as const;\n`;
}

async function main(argv = process.argv.slice(2)) {
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const forceSkipHappySplit = argv.includes("--skip-happy-split");
  const positional = argv.filter((value) => !value.startsWith("-"));
  const sourceArgument = positional[0];
  if (!sourceArgument || positional.length !== 1 || wantsHelp) {
    console.error(
      "Usage: node scripts/import-slime-assets.mjs <source> [--skip-happy-split]",
    );
    if (wantsHelp) return;
    process.exitCode = 2;
    return;
  }
  const happySplitRequested = forceSkipHappySplit ? false : null;

  const sourceRoot = path.resolve(sourceArgument);
  const sourceStat = await fs.stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error(`Slime asset source directory does not exist: ${sourceRoot}`);
  const sourceRealRoot = await fs.realpath(sourceRoot);
  const projectRealRoot = await fs.realpath(projectRoot);
  if (sourceRealRoot === projectRealRoot || sourceRealRoot.startsWith(`${projectRealRoot}${path.sep}`)) {
    throw new Error("Slime asset source must be external to the project runtime roots");
  }

  /**
   * Whether to skip splitting the heart out of the happy animation.
   *
   * That split is the only step needing the Aseprite CLI. Without it the previous
   * happy output is preserved, which keeps an unrelated re-import possible on a
   * machine that has no Aseprite installed. Pass `--skip-happy-split` to force it.
   */
  const skipHappyLayerSplit = happySplitRequested === false || !(await asepriteAvailable());
  if (skipHappyLayerSplit) {
    console.error(
      "Skipping the happy heart layer split; reusing the existing happy output. " +
        "Set ASEPRITE_BIN to a working Aseprite executable to regenerate it.",
    );
  }

  // Composition overlays and backups intentionally repeat canonical action
  // names, so the tree is filtered rather than scanned wholesale.
  const files = (await walk(sourceRoot)).filter((filePath) => {
    const relative = toPosix(path.relative(sourceRoot, filePath));
    if (relative.startsWith("backups/")) return false;
    if (relative.startsWith("props/")) {
      // Drink-free character timelines are the only thing wanted from `props/`.
      // The legacy `props/drink/<flavor>` sheets have the drink baked in, which is
      // what used to leave a lemonade glass under every drink animation.
      return relative.startsWith("props/composition/base/drink-");
    }
    return true;
  });
  const discovered = files
    .map(
      (filePath) =>
        // Drink-free character timelines come from the composition package; every
        // other action still comes from its authored `*-sheet.json`.
        classifyCompositionBase(sourceRoot, filePath) ?? classifySpriteJson(sourceRoot, filePath),
    )
    .filter(Boolean)
    .sort(compareEntries);
  const byKey = new Map();
  for (const item of discovered) {
    if (byKey.has(item.key)) throw new Error(`Duplicate normalized asset key: ${item.key}`);
    byKey.set(item.key, item);
  }
  const expectedKeys = SLIME_EVOLUTIONS.flatMap((evolution) =>
    SLIME_COLORS.flatMap((color) =>
      slimeExpectedActionsForEvolution(evolution).map(
        (action) => `${evolution}/${color}/${action}`,
      ),
    ),
  );
  const missing = expectedKeys.filter((key) => !byKey.has(key));
  if (missing.length > 0) throw new Error(`Missing expected source assets: ${missing.join(", ")}`);
  const unexpected = discovered.filter((item) => !expectedKeys.includes(item.key));
  if (unexpected.length > 0) throw new Error(`Unexpected normalized source assets: ${unexpected.map((item) => item.key).join(", ")}`);

  // Build against complete copies of the current output trees. Other importers
  // own composition overlays, props, and static floors inside these roots, so a
  // full-tree staging copy preserves their files while this importer replaces
  // only its own character/crown directories. A failure from here onward leaves
  // every canonical output untouched.
  const stagingParent = path.join(projectRoot, ".codex", "artifacts");
  await fs.mkdir(stagingParent, { recursive: true });
  const stagingRoot = await fs.mkdtemp(path.join(stagingParent, "slime-import-"));
  webRoot = path.join(stagingRoot, "web");
  mobileRoot = path.join(stagingRoot, "mobile");
  await fs.cp(canonicalWebRoot, webRoot, { recursive: true, force: true });
  await fs.cp(canonicalMobileRoot, mobileRoot, { recursive: true, force: true });

  const entries = [];
  const happyHeartOverlays = [];
  assertProjectOutput(webRoot);
  assertProjectOutput(mobileRoot);
  // Other importers own composition overlays, ball props, and static floors
  // under these roots. Replace only the legacy character/crown outputs.
  for (const outputRoot of [webRoot, mobileRoot]) {
    for (const evolution of SLIME_EVOLUTIONS) {
      await fs.rm(path.join(outputRoot, evolution), { recursive: true, force: true });
    }
    // Crown overlays are regenerated below. The happy-heart overlay is only
    // regenerated when the Aseprite split runs, so it is preserved otherwise
    // rather than deleted and left missing.
    for (const evolution of SLIME_EVOLUTIONS.filter((item) => item !== "base")) {
      await fs.rm(path.join(outputRoot, "overlays", evolution), { recursive: true, force: true });
    }
    if (!skipHappyLayerSplit) {
      await fs.rm(path.join(outputRoot, "overlays", "happy-heart"), {
        recursive: true,
        force: true,
      });
    }
  }
  for (const item of discovered) {
    const parsed = JSON.parse(await fs.readFile(item.filePath, "utf8"));
    const metadata = parseMetadata(item.relative, parsed, sourceRoot);
    const sourceSheet = item.sheetPath;
    const sourceSheet4x = item.sheet4xPath;
    if (!(await exists(sourceSheet))) throw new Error(`Missing canonical sheet PNG for ${item.relative}`);
    const webDir = path.join(webRoot, item.key);
    const mobileDir = path.join(mobileRoot, item.key);
    let layerExport = null;
    try {
      let importedSheet = sourceSheet;
      let importedSheet4x = sourceSheet4x;
      let importedMetadata = { frames: metadata.frames, meta: metadata.meta };
      // Splitting the heart out of the happy animation needs the Aseprite CLI.
      // When it is unavailable the previously imported happy output is reused, so
      // an unrelated import (such as refreshing the drink character sheets) is not
      // blocked by a missing local tool.
      const canSplitHappy = item.evolution === "base"
        && item.action === "happy"
        && !skipHappyLayerSplit;
      if (canSplitHappy) {
        const sourceProject = item.projectPath;
        if (!(await exists(sourceProject))) throw new Error(`Missing layered happy source: ${sourceProject}`);
        layerExport = await exportHappyLayers(sourceProject, sourceSheet, item.relative);
        importedSheet = layerExport.bodySheet;
        importedSheet4x = null;
        importedMetadata = layerExport.bodyMetadata;

        const happyOverlayKey = overlayKeyFor({ evolution: item.evolution, color: item.color });
        const overlayWebDir = path.join(webRoot, "overlays", "happy-heart", happyOverlayKey);
        const overlayMobileDir = path.join(mobileRoot, "overlays", "happy-heart", happyOverlayKey);
        await copyFile(layerExport.heartSheet, path.join(overlayWebDir, "sheet.png"));
        await writeJson(path.join(overlayWebDir, "sheet.json"), layerExport.heartMetadata);
        await generateNearestFourX(layerExport.heartSheet, path.join(overlayMobileDir, "sheet.png"));
        await writeJson(path.join(overlayMobileDir, "sheet.json"), layerExport.heartMetadata);
        happyHeartOverlays.push({
          key: happyOverlayKey,
          evolution: item.evolution,
          color: item.color,
          metadata: layerExport.heartMetadata,
        });
      }

      await copyFile(importedSheet, path.join(webDir, "sheet.png"));
      await writeJson(path.join(webDir, "sheet.json"), importedMetadata);
      if (importedSheet4x && await exists(importedSheet4x)) await copyFile(importedSheet4x, path.join(mobileDir, "sheet.png"));
      else await generateNearestFourX(importedSheet, path.join(mobileDir, "sheet.png"));
      await writeJson(path.join(mobileDir, "sheet.json"), importedMetadata);
      entries.push({ ...item, metadata: importedMetadata });
    } finally {
      if (layerExport) await fs.rm(layerExport.temporaryRoot, { recursive: true, force: true });
    }
  }

  const sharedPuddleJson = path.join(sourceRoot, "floors", "water-puddle", "shared-effects", "water-puddle-sheet.json");
  const sharedPuddlePng = path.join(sourceRoot, "floors", "water-puddle", "shared-effects", "water-puddle-sheet.png");
  const grassPng = path.join(sourceRoot, "floors", "grass-floor", "grass-floor.png");
  const cookiePng = path.join(sourceRoot, "food", "cookie", "cookie-shop-icon-256.png");
  for (const [label, filePath] of [["grass", grassPng], ["cookie", cookiePng]]) if (!(await exists(filePath))) throw new Error(`Missing shared ${label} asset: ${filePath}`);
  await copyFile(grassPng, path.join(webRoot, "shared", "grass-floor.png"));
  await copyFile(cookiePng, path.join(webRoot, "shared", "cookie-shop-icon-256.png"));
  await generateNearestFourX(grassPng, path.join(mobileRoot, "shared", "grass-floor.png"));
  await copyFile(cookiePng, path.join(mobileRoot, "shared", "cookie-shop-icon-256.png"));
  let sharedPuddle = null;
  if (await exists(sharedPuddleJson) && await exists(sharedPuddlePng)) {
    const parsed = parseMetadata("floors/water-puddle/shared-effects/water-puddle-sheet.json", JSON.parse(await fs.readFile(sharedPuddleJson, "utf8")));
    await copyFile(sharedPuddlePng, path.join(webRoot, "shared", "water-puddle", "sheet.png"));
    await writeJson(path.join(webRoot, "shared", "water-puddle", "sheet.json"), { frames: parsed.frames, meta: parsed.meta });
    await generateNearestFourX(sharedPuddlePng, path.join(mobileRoot, "shared", "water-puddle", "sheet.png"));
    await writeJson(path.join(mobileRoot, "shared", "water-puddle", "sheet.json"), { frames: parsed.frames, meta: parsed.meta });
    sharedPuddle = { frames: parsed.frames, meta: parsed.meta };
  }

  const overlays = [];
  for (const evolution of SLIME_EVOLUTIONS.filter((item) => item !== "base")) {
    for (const color of SLIME_COLORS) {
      // The legacy crown diff only ever had a lemonade pair to compare. Runtime
      // crowns now come from `import-slime-crowns.mjs`; these overlays remain
      // because the mobile asset validator still expects them on disk.
      const base = byKey.get(`base/${color}/drink-lemonade`);
      const crowned = byKey.get(`${evolution}/${color}/drink-lemonade`);
      const overlayKey = overlayKeyFor({ evolution, color });
      const outputWeb = path.join(webRoot, "overlays", overlayKey, "overlay.png");
      const outputMobile = path.join(mobileRoot, "overlays", overlayKey, "overlay.png");
      const result = await generateCrownOverlay(
        base.sheetPath,
        crowned.sheetPath,
        outputWeb,
        outputMobile,
      );
      overlays.push({ key: overlayKey, differingPixels: result.differingPixels });
    }
  }
  overlays.sort((a, b) => a.key.localeCompare(b.key));
  happyHeartOverlays.sort((a, b) => a.key.localeCompare(b.key));
  if (skipHappyLayerSplit) {
    // The split did not run, so carry the previously generated entries forward.
    // Dropping them would leave the runtime without a happy overlay even though
    // its art is still on disk.
    happyHeartOverlays.push(...(await readExistingHappyHeartOverlays()));
    happyHeartOverlays.sort((a, b) => a.key.localeCompare(b.key));
  }

  const shared = {
    grassFloor: {
      key: "grass-floor",
      imageUrl: "/creatures/slimes/official/shared/grass-floor.png",
      imageScale: 1,
      surfaceY: 44,
      slimeFootY: 56,
    },
    cookie: {
      key: "cookie-shop-icon-256",
      imageUrl: "/creatures/slimes/official/shared/cookie-shop-icon-256.png",
      imageScale: 1,
    },
    sharedPuddle: sharedPuddle
      ? {
        key: "shared-water-puddle",
        sheetUrl: "/creatures/slimes/official/shared/water-puddle/sheet.png",
        imageScale: 1,
        metadata: sharedPuddle,
      }
      : null,
  };
  const stagedWebRegistry = path.join(stagingRoot, "slime-assets.web.generated.ts");
  const stagedMobileRegistry = path.join(stagingRoot, "slime-assets.mobile.generated.ts");
  const canonicalWebRegistry = path.join(projectRoot, "src", "lib", "pets", "slime-assets.generated.ts");
  const canonicalMobileRegistry = path.join(projectRoot, "apps", "mobile", "lib", "slime-assets.generated.ts");
  await fs.writeFile(stagedWebRegistry, renderWebRegistry(entries, overlays, happyHeartOverlays, shared), "utf8");
  await fs.writeFile(stagedMobileRegistry, renderMobileRegistry(entries, overlays, happyHeartOverlays, shared), "utf8");

  await publishStagedOutputs(
    [
      { source: webRoot, target: canonicalWebRoot },
      { source: mobileRoot, target: canonicalMobileRoot },
      { source: stagedWebRegistry, target: canonicalWebRegistry },
      { source: stagedMobileRegistry, target: canonicalMobileRegistry },
    ],
    stagingRoot,
  );
  webRoot = canonicalWebRoot;
  mobileRoot = canonicalMobileRoot;
  await fs.rm(stagingRoot, { recursive: true, force: true });

  const report = {
    source: sourceRoot,
    coloredEntries: entries.length,
    entriesByEvolution: Object.fromEntries(SLIME_EVOLUTIONS.map((evolution) => [evolution, entries.filter((entry) => entry.evolution === evolution).length])),
    entriesByAction: Object.fromEntries(SLIME_ACTIONS.map((action) => [action, entries.filter((entry) => entry.action === action).length])),
    crownOverlays: overlays.length,
    happyHeartOverlays: happyHeartOverlays.length,
    sharedPuddle: Boolean(sharedPuddle),
    generated: {
      webRoot: toPosix(path.relative(projectRoot, canonicalWebRoot)),
      mobileRoot: toPosix(path.relative(projectRoot, canonicalMobileRoot)),
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
