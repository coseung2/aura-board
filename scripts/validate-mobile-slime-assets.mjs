#!/usr/bin/env node

/**
 * Validate the copied mobile slime assets without importing the external
 * SlimeAssets package or evaluating the generated Metro registry.
 *
 * The mobile tree is intentionally checked as files on disk.  This keeps the
 * check useful in CI and catches a stale/malformed copied asset before Metro
 * tries to bundle it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(projectRoot, "apps", "mobile", "assets", "slimes");

const MOBILE_IMAGE_SCALE = 4;
const OVERLAY_SOURCE_SIZE = 64;
const STATIC_SHARED_DIMENSIONS = Object.freeze({
  "shared/cookie-shop-icon-256-disabled.png": [256, 256],
  "shared/cookie-shop-icon-256.png": [256, 256],
  "shared/grass-floor.png": [256, 256],
  "shared/trampoline-floor.png": [256, 256],
});

const SLIME_COLORS = ["blue", "green", "yellow", "purple", "red"];
const SLIME_EVOLUTIONS = ["base", "gold-crown-red-gem", "silver-crown-blue-gem"];
const SLIME_ACTIONS = ["idle", "happy", "drink", "water-puddle", "trampoline"];

// Crowned idle/happy animations reuse the base sheet with an overlay at
// runtime. Those precomposed source sheets may be present in a copied package,
// but the importer intentionally does not require or copy them.
const REQUIRED_RUNTIME_SHEET_KEYS = SLIME_EVOLUTIONS.flatMap((evolution) =>
  SLIME_COLORS.flatMap((color) =>
    SLIME_ACTIONS.filter(
      (action) => evolution === "base" || (action !== "idle" && action !== "happy"),
    ).map((action) => `${evolution}/${color}/${action}`),
  ),
);

const EXPECTED_OVERLAY_KEYS = SLIME_EVOLUTIONS.filter((evolution) => evolution !== "base").flatMap(
  (evolution) => SLIME_COLORS.map((color) => `${evolution}/${color}`),
);

const REQUIRED_SHARED_FILES = [
  ...Object.keys(STATIC_SHARED_DIMENSIONS),
  "shared/water-puddle/sheet.json",
  "shared/water-puddle/sheet.png",
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function relativePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function assetPath(relative) {
  return path.join(assetsRoot, ...relative.split("/"));
}

function addError(errors, seen, message) {
  if (seen.has(message)) return;
  seen.add(message);
  errors.push(message);
}

function readPngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG file");
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("PNG is missing its IHDR header");
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new Error(`PNG dimensions are not positive (${width}x${height})`);
  }
  return { width, height };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON (${detail})`);
  }
}

function validateOptionalSize(value, label, problems, includeOrigin = true) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    problems.push(`${label} must be an object`);
    return;
  }
  if (includeOrigin && (!isNonNegativeInteger(value.x) || !isNonNegativeInteger(value.y))) {
    problems.push(`${label}.x/.y must be non-negative integers`);
  }
  if (!isPositiveInteger(value.w) || !isPositiveInteger(value.h)) {
    problems.push(`${label}.w/.h must be positive integers`);
  }
}

function validateSheetMetadata(label, metadata, pngDimensions, problems) {
  if (!isRecord(metadata)) {
    problems.push("metadata root must be an object");
    return;
  }

  const size = isRecord(metadata.meta) && isRecord(metadata.meta.size) ? metadata.meta.size : null;
  if (!size) {
    problems.push("meta.size is required");
  } else {
    if (!isPositiveInteger(size.w) || !isPositiveInteger(size.h)) {
      problems.push("meta.size.w/.h must be positive integers");
    } else if (
      pngDimensions &&
      (pngDimensions.width !== size.w * MOBILE_IMAGE_SCALE ||
        pngDimensions.height !== size.h * MOBILE_IMAGE_SCALE)
    ) {
      problems.push(
        `sheet.png dimensions ${pngDimensions.width}x${pngDimensions.height} do not equal ` +
          `${size.w * MOBILE_IMAGE_SCALE}x${size.h * MOBILE_IMAGE_SCALE} (4x meta.size)`,
      );
    }
  }

  if (!Array.isArray(metadata.frames) || metadata.frames.length === 0) {
    problems.push("frames must be a non-empty array");
    return;
  }

  metadata.frames.forEach((frame, index) => {
    const frameLabel = `frame ${index}`;
    if (!isRecord(frame) || !isRecord(frame.frame)) {
      problems.push(`${frameLabel} must contain a frame rectangle`);
      return;
    }

    const rect = frame.frame;
    if (!isNonNegativeInteger(rect.x) || !isNonNegativeInteger(rect.y)) {
      problems.push(`${frameLabel}.frame.x/.y must be non-negative integers`);
    }
    if (!isPositiveInteger(rect.w) || !isPositiveInteger(rect.h)) {
      problems.push(`${frameLabel}.frame.w/.h must be positive integers`);
    }
    if (size && isPositiveInteger(size.w) && isPositiveInteger(size.h)) {
      if (isNonNegativeInteger(rect.x) && isPositiveInteger(rect.w) && rect.x + rect.w > size.w) {
        problems.push(`${frameLabel} exceeds meta.size width (${rect.x + rect.w} > ${size.w})`);
      }
      if (isNonNegativeInteger(rect.y) && isPositiveInteger(rect.h) && rect.y + rect.h > size.h) {
        problems.push(`${frameLabel} exceeds meta.size height (${rect.y + rect.h} > ${size.h})`);
      }
    }
    if (!Number.isFinite(frame.duration) || frame.duration <= 0) {
      problems.push(`${frameLabel}.duration must be positive`);
    }
    if (frame.rotated !== false) {
      problems.push(`${frameLabel}.rotated must be false`);
    }

    validateOptionalSize(frame.spriteSourceSize, `${frameLabel}.spriteSourceSize`, problems);
    validateOptionalSize(frame.sourceSize, `${frameLabel}.sourceSize`, problems, false);
  });

  if (pngDimensions === null) {
    problems.push(`${label}: unable to validate sheet.png dimensions`);
  }
}

function validateSheet(relativeDirectory, errors, seen, validatedSheets) {
  const jsonRelative = `${relativeDirectory}/sheet.json`;
  const pngRelative = `${relativeDirectory}/sheet.png`;
  const jsonPath = assetPath(jsonRelative);
  const pngPath = assetPath(pngRelative);
  const label = relativeDirectory;
  const jsonExists = fs.existsSync(jsonPath);
  const pngExists = fs.existsSync(pngPath);

  if (!jsonExists) {
    addError(errors, seen, `${jsonRelative}: missing sheet.json (expected a JSON/PNG pair)`);
  }
  if (!pngExists) {
    addError(errors, seen, `${pngRelative}: missing sheet.png (expected a JSON/PNG pair)`);
  }
  if (!jsonExists || !pngExists) return;

  validatedSheets.add(relativeDirectory);
  let metadata;
  try {
    metadata = readJson(jsonPath);
  } catch (error) {
    addError(errors, seen, `${jsonRelative}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  let pngDimensions = null;
  try {
    pngDimensions = readPngDimensions(pngPath);
  } catch (error) {
    addError(
      errors,
      seen,
      `${pngRelative}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const problems = [];
  validateSheetMetadata(label, metadata, pngDimensions, problems);
  for (const problem of problems) addError(errors, seen, `${label}: ${problem}`);
}

function validatePng(relativeFile, expectedDimensions, errors, seen) {
  const filePath = assetPath(relativeFile);
  if (!fs.existsSync(filePath)) {
    addError(errors, seen, `${relativeFile}: required shared asset is missing`);
    return;
  }
  let dimensions;
  try {
    dimensions = readPngDimensions(filePath);
  } catch (error) {
    addError(errors, seen, `${relativeFile}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (expectedDimensions && (dimensions.width !== expectedDimensions[0] || dimensions.height !== expectedDimensions[1])) {
    addError(
      errors,
      seen,
      `${relativeFile}: dimensions ${dimensions.width}x${dimensions.height}; expected ${expectedDimensions[0]}x${expectedDimensions[1]}`,
    );
  }
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

function validateDiscoveredSheetPairs(errors, seen, validatedSheets) {
  const files = walkFiles(assetsRoot);
  const jsonFiles = files.filter((filePath) => path.basename(filePath) === "sheet.json");
  const pngFiles = files.filter((filePath) => path.basename(filePath) === "sheet.png");
  const jsonSet = new Set(jsonFiles.map((filePath) => path.dirname(filePath)));
  const pngSet = new Set(pngFiles.map((filePath) => path.dirname(filePath)));

  for (const directory of [...jsonSet].sort()) {
    const relativeDirectory = relativePath(directory).replace(
      /^apps\/mobile\/assets\/slimes\//,
      "",
    );
    if (!pngSet.has(directory)) {
      addError(errors, seen, `${relativeDirectory}/sheet.png: missing paired sheet.png`);
    }
  }
  for (const directory of [...pngSet].sort()) {
    const relativeDirectory = relativePath(directory)
      .replace(/^apps\/mobile\/assets\/slimes\//, "");
    if (!jsonSet.has(directory)) {
      addError(errors, seen, `${relativeDirectory}/sheet.json: missing paired sheet.json`);
    }
  }

  for (const directory of [...jsonSet].filter((item) => pngSet.has(item)).sort()) {
    const relativeDirectory = relativePath(directory)
      .replace(/^apps\/mobile\/assets\/slimes\//, "");
    if (!relativeDirectory.startsWith("shared/")) {
      validateSheet(relativeDirectory, errors, seen, validatedSheets);
    }
  }
}

function main() {
  const errors = [];
  const seen = new Set();
  const validatedSheets = new Set();

  if (!fs.existsSync(assetsRoot) || !fs.statSync(assetsRoot).isDirectory()) {
    addError(errors, seen, `${relativePath(assetsRoot)}: mobile slime asset directory is missing`);
  } else {
    for (const key of REQUIRED_RUNTIME_SHEET_KEYS) {
      validateSheet(key, errors, seen, validatedSheets);
    }

    for (const key of EXPECTED_OVERLAY_KEYS) {
      validatePng(`overlays/${key}/overlay.png`, [OVERLAY_SOURCE_SIZE * MOBILE_IMAGE_SCALE, OVERLAY_SOURCE_SIZE * MOBILE_IMAGE_SCALE], errors, seen);
    }

    for (const relativeFile of REQUIRED_SHARED_FILES) {
      if (relativeFile.endsWith("/sheet.json")) continue;
      validatePng(relativeFile, STATIC_SHARED_DIMENSIONS[relativeFile] ?? null, errors, seen);
    }
    validateSheet("shared/water-puddle", errors, seen, validatedSheets);
    validateDiscoveredSheetPairs(errors, seen, validatedSheets);
  }

  if (errors.length > 0) {
    console.error(`Mobile slime asset check failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Mobile slime assets OK: ${REQUIRED_RUNTIME_SHEET_KEYS.length} required runtime sheets, ` +
      `${EXPECTED_OVERLAY_KEYS.length} crown overlays, ${REQUIRED_SHARED_FILES.length} shared files ` +
      `(validated ${validatedSheets.size} sheet pairs).`,
  );
}

main();
