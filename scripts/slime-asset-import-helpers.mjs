import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

import {
  SLIME_ACTIONS,
  SLIME_COLORS,
  SLIME_EVOLUTIONS,
} from "../src/lib/pets/slime-asset-import-contract.mjs";
import { exists, toPosix, writeJson } from "./slime-import-shared-helpers.mjs";

export { exists, toPosix, writeJson };

const execFile = promisify(execFileCallback);
const colorSet = new Set(SLIME_COLORS);
const evolutionSet = new Set(SLIME_EVOLUTIONS);
const actionSet = new Set(SLIME_ACTIONS);
const happyFrameCount = 12;
const happyCanvas = { width: 64, height: 64 };
const happyLayerNames = { body: "슬라임", heart: "하트" };

const keyFor = ({ evolution, color, action }) =>
  `${evolution}/${color}/${action}`;
export const overlayKeyFor = ({ evolution, color }) => `${evolution}/${color}`;

export async function walk(root) {
  const result = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

export function classifySpriteJson(sourceRoot, filePath) {
  const relative = toPosix(path.relative(sourceRoot, filePath));
  if (!relative.endsWith("-sheet.json")) return null;
  const parts = relative.split("/");
  const color = parts.find((part) => colorSet.has(part));
  const crown = parts.find((part) => evolutionSet.has(part));
  const evolution = crown ?? "base";
  if (!color) return null;

  let action = null;
  if (parts.includes("characters") && parts.includes("idle")) action = "idle";
  else if (parts.includes("happy-heart-assets")) action = "happy";
  else if (parts.includes("water-puddle") && parts.includes("jump")) {
    action = "water-puddle";
  } else if (parts.includes("trampoline")) action = "trampoline";
  else if (
    parts.includes("crowned-drink-assets") &&
    parts.includes("lemonade")
  ) {
    action = "drink-lemonade";
  } else if (
    parts.includes("crowned-jump-assets") &&
    (parts.includes("water-puddle") || parts.includes("trampoline"))
  ) {
    action = parts.includes("water-puddle") ? "water-puddle" : "trampoline";
  }

  if (!action || !actionSet.has(action)) return null;
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

export function classifyCompositionBase(sourceRoot, filePath) {
  const relative = toPosix(path.relative(sourceRoot, filePath));
  const match =
    /^props\/composition\/base\/(drink-[a-z-]+)\/([a-z]+)\/slime\.json$/.exec(
      relative,
    );
  if (!match) return null;
  const [, action, color] = match;
  if (!colorSet.has(color) || !actionSet.has(action)) return null;
  return {
    sourceRoot,
    filePath,
    relative,
    evolution: "base",
    color,
    action,
    key: keyFor({ evolution: "base", color, action }),
    sheetPath: path.join(path.dirname(filePath), "slime.png"),
    sheet4xPath: path.join(path.dirname(filePath), "slime-4x.png"),
  };
}

export function compareEntries(a, b) {
  const evolutionDelta =
    SLIME_EVOLUTIONS.indexOf(a.evolution) -
    SLIME_EVOLUTIONS.indexOf(b.evolution);
  if (evolutionDelta) return evolutionDelta;
  const colorDelta =
    SLIME_COLORS.indexOf(a.color) - SLIME_COLORS.indexOf(b.color);
  if (colorDelta) return colorDelta;
  return SLIME_ACTIONS.indexOf(a.action) - SLIME_ACTIONS.indexOf(b.action);
}

function sanitizeMeta(meta, sourceRoot) {
  const sourcePrefix = sourceRoot ? `${toPosix(sourceRoot)}/` : null;
  const isAbsolute = (value) => /^([A-Za-z]:[\\/]|\/|\\\\)/.test(value);
  const sanitized = {};
  for (const [field, value] of Object.entries(meta)) {
    if (typeof value !== "string" || !isAbsolute(value)) {
      sanitized[field] = value;
      continue;
    }
    const posix = toPosix(value);
    if (
      sourcePrefix &&
      posix.toLowerCase().startsWith(sourcePrefix.toLowerCase())
    ) {
      sanitized[field] = posix.slice(sourcePrefix.length);
    }
  }
  return sanitized;
}

export function parseMetadata(relative, parsed, sourceRoot = null) {
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.frames ||
    typeof parsed.frames !== "object" ||
    !parsed.meta ||
    typeof parsed.meta !== "object"
  ) {
    throw new Error(`Invalid Aseprite JSON schema: ${relative}`);
  }
  const sourceFrames = Array.isArray(parsed.frames)
    ? parsed.frames.map((frame, index) => [
        String(frame?.filename ?? index),
        frame,
      ])
    : Object.entries(parsed.frames);
  const frames = sourceFrames.map(([filename, frame], index) => {
    if (!frame || typeof frame !== "object" || !frame.frame) {
      throw new Error(`Invalid frame ${index} in ${relative}`);
    }
    const rect = frame.frame;
    for (const field of ["x", "y", "w", "h"]) {
      if (!Number.isSafeInteger(rect[field]) || rect[field] < 0) {
        throw new Error(`Invalid frame.${field} in ${relative}`);
      }
    }
    if (!Number.isFinite(frame.duration) || frame.duration < 0) {
      throw new Error(`Invalid frame duration in ${relative}`);
    }
    return {
      filename: String(frame.filename ?? filename ?? `${index}`),
      frame: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      rotated: Boolean(frame.rotated),
      trimmed: Boolean(frame.trimmed),
      spriteSourceSize: frame.spriteSourceSize ?? {
        x: 0,
        y: 0,
        w: rect.w,
        h: rect.h,
      },
      sourceSize: frame.sourceSize ?? { w: rect.w, h: rect.h },
      duration: frame.duration,
    };
  });
  const meta = parsed.meta;
  if (
    !meta.size ||
    !Number.isSafeInteger(meta.size.w) ||
    !Number.isSafeInteger(meta.size.h)
  ) {
    throw new Error(`Missing meta.size in ${relative}`);
  }
  return { frames, meta: sanitizeMeta(meta, sourceRoot) };
}

export async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

export async function generateNearestFourX(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const image = sharp(source);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read image dimensions: ${source}`);
  }
  await image
    .resize({
      width: metadata.width * 4,
      height: metadata.height * 4,
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toFile(target);
}

function asepriteBinary() {
  return process.env.ASEPRITE_BIN ?? process.env.ASEPRITE_PATH ?? "aseprite";
}

export async function readExistingHappyHeartOverlays(webRoot) {
  const overlayRoot = path.join(webRoot, "overlays", "happy-heart");
  const evolutions = await fs.readdir(overlayRoot).catch(() => null);
  if (!evolutions) return [];
  const overlays = [];
  for (const evolution of evolutions.sort()) {
    const colors = await fs
      .readdir(path.join(overlayRoot, evolution))
      .catch(() => []);
    for (const color of colors.sort()) {
      const metadataPath = path.join(
        overlayRoot,
        evolution,
        color,
        "sheet.json",
      );
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

export async function asepriteAvailable() {
  try {
    await execFile(asepriteBinary(), ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function exportAsepriteLayer(
  sourceProject,
  layerName,
  targetSheet,
  targetJson,
) {
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
      String(happyFrameCount),
    ],
    { windowsHide: true },
  );
}

async function readHappyLayerMetadata(relative, filePath) {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  const metadata = parseMetadata(relative, parsed);
  if (
    metadata.frames.length !== happyFrameCount ||
    metadata.meta.size.w !== happyCanvas.width * happyFrameCount ||
    metadata.meta.size.h !== happyCanvas.height
  ) {
    throw new Error(
      `Happy layer export has unexpected dimensions or frame count for ${relative}: ` +
        `${metadata.meta.size.w}x${metadata.meta.size.h}, ${metadata.frames.length} frames`,
    );
  }
  return { frames: metadata.frames, meta: metadata.meta };
}

async function verifyHappyLayerComposition(
  sourceSheet,
  bodySheet,
  heartSheet,
  context,
) {
  const [source, body, heart] = await Promise.all(
    [sourceSheet, bodySheet, heartSheet].map((filePath) =>
      sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ),
  );
  if (
    source.info.width !== happyCanvas.width * happyFrameCount ||
    source.info.height !== happyCanvas.height ||
    body.info.width !== source.info.width ||
    body.info.height !== source.info.height ||
    heart.info.width !== source.info.width ||
    heart.info.height !== source.info.height
  ) {
    throw new Error(
      `Happy layer export dimensions do not match for ${context}`,
    );
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
      source.data[index] !== expected[index] ||
      source.data[index + 1] !== expected[index + 1] ||
      source.data[index + 2] !== expected[index + 2] ||
      source.data[index + 3] !== expectedAlpha
    ) {
      mismatchedPixels += 1;
    }
  }
  if (heartPixels === 0 || bodyPixels === 0 || mismatchedPixels !== 0) {
    throw new Error(
      `Happy layer export failed composition verification for ${context}: ` +
        `body=${bodyPixels}, heart=${heartPixels}, mismatched=${mismatchedPixels}`,
    );
  }
}

export async function exportHappyLayers(sourceProject, sourceSheet, relative) {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "aura-slime-happy-"),
  );
  const bodySheet = path.join(temporaryRoot, "body.png");
  const bodyJson = path.join(temporaryRoot, "body.json");
  const heartSheet = path.join(temporaryRoot, "heart.png");
  const heartJson = path.join(temporaryRoot, "heart.json");
  try {
    await exportAsepriteLayer(
      sourceProject,
      happyLayerNames.body,
      bodySheet,
      bodyJson,
    );
    await exportAsepriteLayer(
      sourceProject,
      happyLayerNames.heart,
      heartSheet,
      heartJson,
    );
    const [bodyMetadata, heartMetadata] = await Promise.all([
      readHappyLayerMetadata(`${relative} [${happyLayerNames.body}]`, bodyJson),
      readHappyLayerMetadata(
        `${relative} [${happyLayerNames.heart}]`,
        heartJson,
      ),
    ]);
    await verifyHappyLayerComposition(
      sourceSheet,
      bodySheet,
      heartSheet,
      relative,
    );
    return {
      temporaryRoot,
      bodySheet,
      heartSheet,
      bodyMetadata,
      heartMetadata,
    };
  } catch (error) {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    throw new Error(
      `Unable to extract happy layers from ${sourceProject}. ` +
        `Set ASEPRITE_BIN to a compatible Aseprite executable. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function generateCrownOverlay(
  baseSheet,
  crownedSheet,
  targetWeb,
  targetMobile,
) {
  const [base, crowned] = await Promise.all([
    sharp(baseSheet)
      .extract({ left: 0, top: 0, width: 64, height: 64 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    sharp(crownedSheet)
      .extract({ left: 0, top: 0, width: 64, height: 64 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
  ]);
  if (base.info.channels !== 4 || crowned.info.channels !== 4) {
    throw new Error("Crown overlay inputs must decode to RGBA");
  }
  const output = Buffer.alloc(64 * 64 * 4);
  let differingPixels = 0;
  for (let index = 0; index < output.length; index += 4) {
    const different =
      base.data[index] !== crowned.data[index] ||
      base.data[index + 1] !== crowned.data[index + 1] ||
      base.data[index + 2] !== crowned.data[index + 2] ||
      base.data[index + 3] !== crowned.data[index + 3];
    if (different) {
      output[index] = crowned.data[index];
      output[index + 1] = crowned.data[index + 1];
      output[index + 2] = crowned.data[index + 2];
      output[index + 3] = crowned.data[index + 3];
      differingPixels += 1;
    }
  }
  if (differingPixels === 0) {
    throw new Error(`Crown overlay has no differing pixels: ${crownedSheet}`);
  }
  const webBuffer = await sharp(output, {
    raw: { width: 64, height: 64, channels: 4 },
  })
    .png()
    .toBuffer();
  await fs.mkdir(path.dirname(targetWeb), { recursive: true });
  await fs.writeFile(targetWeb, webBuffer);
  await generateNearestFourX(targetWeb, targetMobile);
  return { differingPixels };
}
