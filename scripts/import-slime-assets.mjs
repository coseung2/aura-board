#!/usr/bin/env node

/**
 * Import the SlimeAssets source package into the web and Expo asset roots.
 *
 * The source directory is deliberately a command-line input.  Generated
 * registries contain only project-local URLs and relative Metro requires, so
 * the source package is never a runtime dependency.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(projectRoot, "public", "creatures", "slimes", "official");
const mobileRoot = path.join(projectRoot, "apps", "mobile", "assets", "slimes");

function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to replace slime assets outside the project: ${outputRoot}`);
  }
}

export const SLIME_COLORS = ["blue", "green", "yellow", "purple", "red"];
export const SLIME_EVOLUTIONS = ["base", "gold-crown-red-gem", "silver-crown-blue-gem"];
export const SLIME_ACTIONS = ["idle", "happy", "drink", "water-puddle", "trampoline"];
export const SLIME_PLAYBACK_BY_ACTION = {
  idle: { loop: true, oneShot: false },
  happy: { loop: false, oneShot: true },
  drink: { loop: false, oneShot: true },
  "water-puddle": { loop: false, oneShot: true },
  trampoline: { loop: false, oneShot: true },
};

const COLOR_SET = new Set(SLIME_COLORS);
const EVOLUTION_SET = new Set(SLIME_EVOLUTIONS);
const ACTION_SET = new Set(SLIME_ACTIONS);

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
  // The canonical package uses `props/drink/lemonade`; keep accepting the
  // older plural `drinks` folder so normalized keys remain source-layout
  // agnostic without falling back to a color filter.
  else if ((parts.includes("drink") || parts.includes("drinks")) && parts.includes("lemonade")) action = "drink";
  else if (parts.includes("happy-heart-assets")) action = "happy";
  else if (parts.includes("water-puddle") && parts.includes("jump")) action = "water-puddle";
  else if (parts.includes("trampoline")) action = "trampoline";
  else if (parts.includes("crowned-drink-assets") && parts.includes("lemonade")) action = "drink";
  else if (parts.includes("crowned-jump-assets") && (parts.includes("water-puddle") || parts.includes("trampoline"))) {
    action = parts.includes("water-puddle") ? "water-puddle" : "trampoline";
  }

  if (!action || !ACTION_SET.has(action)) return null;
  if (evolution !== "base" && action === "idle") return null;
  if (evolution !== "base" && action === "happy") return null;
  return { sourceRoot, filePath, relative, evolution, color, action, key: keyFor({ evolution, color, action }) };
}

function compareEntries(a, b) {
  const evolutionDelta = SLIME_EVOLUTIONS.indexOf(a.evolution) - SLIME_EVOLUTIONS.indexOf(b.evolution);
  if (evolutionDelta) return evolutionDelta;
  const colorDelta = SLIME_COLORS.indexOf(a.color) - SLIME_COLORS.indexOf(b.color);
  if (colorDelta) return colorDelta;
  return SLIME_ACTIONS.indexOf(a.action) - SLIME_ACTIONS.indexOf(b.action);
}

function parseMetadata(relative, parsed) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.frames) || !parsed.meta || typeof parsed.meta !== "object") {
    throw new Error(`Invalid Aseprite JSON schema: ${relative}`);
  }
  const frames = parsed.frames.map((frame, index) => {
    if (!frame || typeof frame !== "object" || !frame.frame || typeof frame.frame !== "object") {
      throw new Error(`Invalid frame ${index} in ${relative}`);
    }
    const rect = frame.frame;
    for (const field of ["x", "y", "w", "h"]) {
      if (!Number.isSafeInteger(rect[field]) || rect[field] < 0) throw new Error(`Invalid frame.${field} in ${relative}`);
    }
    if (!Number.isFinite(frame.duration) || frame.duration < 0) throw new Error(`Invalid frame duration in ${relative}`);
    return {
      filename: String(frame.filename ?? `${index}`),
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
  return { frames, meta };
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

function renderWebRegistry(entries, overlays, shared) {
  const entriesCode = entries.map((entry) => `  ${JSON.stringify(entry.key)}: ${tsLiteral(webEntryLiteral(entry))},`).join("\n");
  const overlaysCode = overlays.map((overlay) => `  ${JSON.stringify(overlay.key)}: ${tsLiteral({ key: overlay.key, imageUrl: `/creatures/slimes/official/overlays/${overlay.key}/overlay.png`, imageScale: 1, differingPixels: overlay.differingPixels })},`).join("\n");
  return `// Generated by scripts/import-slime-assets.mjs. Do not edit by hand.\n\nexport const SLIME_WEB_ASSET_REGISTRY = {\n${entriesCode}\n} as const;\n\nexport const SLIME_WEB_CROWN_OVERLAY_REGISTRY = {\n${overlaysCode}\n} as const;\n\nexport const SLIME_WEB_SHARED_ASSETS = ${tsLiteral(shared)} as const;\n`;
}

function renderMobileRegistry(entries, overlays, shared) {
  const entriesCode = entries.map((entry) => {
    const value = mobileEntryLiteral(entry);
    const { sheetRequire, ...literal } = value;
    return `  ${JSON.stringify(entry.key)}: { ...${tsLiteral(literal)}, sheet: require(${JSON.stringify(sheetRequire)}) },`;
  }).join("\n");
  const overlaysCode = overlays.map((overlay) => `  ${JSON.stringify(overlay.key)}: { key: ${JSON.stringify(overlay.key)}, imageScale: 4, differingPixels: ${overlay.differingPixels}, overlay: require(${JSON.stringify(`../assets/slimes/overlays/${overlay.key}/overlay.png`)}) },`).join("\n");
  const sharedCode = {
    grassFloor: { key: "grass-floor", imageScale: 4, surfaceY: 44, slimeFootY: 56, source: "../assets/slimes/shared/grass-floor.png" },
    cookie: { key: "cookie-shop-icon-256", imageScale: 1, source: "../assets/slimes/shared/cookie-shop-icon-256.png" },
    sharedPuddle: shared.sharedPuddle ? { ...shared.sharedPuddle, source: "../assets/slimes/shared/water-puddle/sheet.png", imageScale: 4 } : null,
  };
  return `// Generated by scripts/import-slime-assets.mjs. Do not edit by hand.\n\nexport const SLIME_MOBILE_ASSET_REGISTRY = {\n${entriesCode}\n} as const;\n\nexport const SLIME_MOBILE_CROWN_OVERLAY_REGISTRY = {\n${overlaysCode}\n} as const;\n\nexport const SLIME_MOBILE_SHARED_ASSETS = {\n  grassFloor: { ...${tsLiteral(sharedCode.grassFloor)}, image: require(${JSON.stringify(sharedCode.grassFloor.source)}) },\n  cookie: { ...${tsLiteral(sharedCode.cookie)}, image: require(${JSON.stringify(sharedCode.cookie.source)}) },\n  sharedPuddle: ${sharedCode.sharedPuddle ? `{ ...${tsLiteral(sharedCode.sharedPuddle)}, image: require(${JSON.stringify(sharedCode.sharedPuddle.source)}) }` : "null"},\n} as const;\n\nexport const SLIME_MOBILE_ANIMATION_MANIFEST = {\n  schemaVersion: 1,\n  imageScale: 4,\n  colors: ${tsLiteral(SLIME_COLORS)},\n  evolutions: ${tsLiteral(SLIME_EVOLUTIONS)},\n  actions: ${tsLiteral(SLIME_ACTIONS)},\n  playbackByAction: ${tsLiteral(SLIME_PLAYBACK_BY_ACTION)},\n  assets: SLIME_MOBILE_ASSET_REGISTRY,\n  crownOverlays: SLIME_MOBILE_CROWN_OVERLAY_REGISTRY,\n  shared: SLIME_MOBILE_SHARED_ASSETS,\n} as const;\n`;
}

async function main(argv = process.argv.slice(2)) {
  const sourceArgument = argv[0];
  if (!sourceArgument || argv.length !== 1 || sourceArgument === "--help" || sourceArgument === "-h") {
    console.error("Usage: node scripts/import-slime-assets.mjs <source>");
    if (sourceArgument === "--help" || sourceArgument === "-h") return;
    process.exitCode = 2;
    return;
  }

  const sourceRoot = path.resolve(sourceArgument);
  const sourceStat = await fs.stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error(`Slime asset source directory does not exist: ${sourceRoot}`);
  const sourceRealRoot = await fs.realpath(sourceRoot);
  const projectRealRoot = await fs.realpath(projectRoot);
  if (sourceRealRoot === projectRealRoot || sourceRealRoot.startsWith(`${projectRealRoot}${path.sep}`)) {
    throw new Error("Slime asset source must be external to the project runtime roots");
  }

  const files = await walk(sourceRoot);
  const discovered = files.map((filePath) => classifySpriteJson(sourceRoot, filePath)).filter(Boolean).sort(compareEntries);
  const byKey = new Map();
  for (const item of discovered) {
    if (byKey.has(item.key)) throw new Error(`Duplicate normalized asset key: ${item.key}`);
    byKey.set(item.key, item);
  }
  const expectedKeys = SLIME_EVOLUTIONS.flatMap((evolution) => SLIME_COLORS.flatMap((color) => SLIME_ACTIONS.filter((action) => evolution === "base" || (action !== "idle" && action !== "happy")).map((action) => `${evolution}/${color}/${action}`)));
  const missing = expectedKeys.filter((key) => !byKey.has(key));
  if (missing.length > 0) throw new Error(`Missing expected source assets: ${missing.join(", ")}`);
  const unexpected = discovered.filter((item) => !expectedKeys.includes(item.key));
  if (unexpected.length > 0) throw new Error(`Unexpected normalized source assets: ${unexpected.map((item) => item.key).join(", ")}`);

  const entries = [];
  assertProjectOutput(webRoot);
  assertProjectOutput(mobileRoot);
  await fs.rm(webRoot, { recursive: true, force: true });
  await fs.rm(mobileRoot, { recursive: true, force: true });
  for (const item of discovered) {
    const parsed = JSON.parse(await fs.readFile(item.filePath, "utf8"));
    const metadata = parseMetadata(item.relative, parsed);
    const stem = path.basename(item.filePath, "-sheet.json");
    const sourceSheet = path.join(path.dirname(item.filePath), `${stem}-sheet.png`);
    const sourceSheet4x = path.join(path.dirname(item.filePath), `${stem}-sheet-4x.png`);
    if (!(await exists(sourceSheet))) throw new Error(`Missing canonical sheet PNG for ${item.relative}`);
    const webDir = path.join(webRoot, item.key);
    const mobileDir = path.join(mobileRoot, item.key);
    await copyFile(sourceSheet, path.join(webDir, "sheet.png"));
    await writeJson(path.join(webDir, "sheet.json"), { frames: metadata.frames, meta: metadata.meta });
    if (await exists(sourceSheet4x)) await copyFile(sourceSheet4x, path.join(mobileDir, "sheet.png"));
    else await generateNearestFourX(sourceSheet, path.join(mobileDir, "sheet.png"));
    await writeJson(path.join(mobileDir, "sheet.json"), { frames: metadata.frames, meta: metadata.meta });
    entries.push({ ...item, metadata: { frames: metadata.frames, meta: metadata.meta } });
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
      const base = byKey.get(`base/${color}/drink`);
      const crowned = byKey.get(`${evolution}/${color}/drink`);
      const baseStem = path.basename(base.filePath, "-sheet.json");
      const crownedStem = path.basename(crowned.filePath, "-sheet.json");
      const overlayKey = overlayKeyFor({ evolution, color });
      const outputWeb = path.join(webRoot, "overlays", overlayKey, "overlay.png");
      const outputMobile = path.join(mobileRoot, "overlays", overlayKey, "overlay.png");
      const result = await generateCrownOverlay(
        path.join(path.dirname(base.filePath), `${baseStem}-sheet.png`),
        path.join(path.dirname(crowned.filePath), `${crownedStem}-sheet.png`),
        outputWeb,
        outputMobile,
      );
      overlays.push({ key: overlayKey, differingPixels: result.differingPixels });
    }
  }
  overlays.sort((a, b) => a.key.localeCompare(b.key));

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
  await fs.mkdir(path.dirname(path.join(projectRoot, "src", "lib", "pets", "slime-assets.generated.ts")), { recursive: true });
  await fs.writeFile(path.join(projectRoot, "src", "lib", "pets", "slime-assets.generated.ts"), renderWebRegistry(entries, overlays, shared), "utf8");
  await fs.writeFile(path.join(projectRoot, "apps", "mobile", "lib", "slime-assets.generated.ts"), renderMobileRegistry(entries, overlays, shared), "utf8");

  const report = {
    source: sourceRoot,
    coloredEntries: entries.length,
    entriesByEvolution: Object.fromEntries(SLIME_EVOLUTIONS.map((evolution) => [evolution, entries.filter((entry) => entry.evolution === evolution).length])),
    entriesByAction: Object.fromEntries(SLIME_ACTIONS.map((action) => [action, entries.filter((entry) => entry.action === action).length])),
    crownOverlays: overlays.length,
    sharedPuddle: Boolean(sharedPuddle),
    generated: {
      webRoot: toPosix(path.relative(projectRoot, webRoot)),
      mobileRoot: toPosix(path.relative(projectRoot, mobileRoot)),
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
