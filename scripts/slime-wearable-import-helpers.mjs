import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {
  CANVAS,
  IDLE_DERIVED_ROLES,
  SLIME_COLORS,
  UNPUBLISHED_ROLES,
  WEARABLE_ROLES,
  canvasHeightFor,
  characterOffsetYFor,
  frameCountFor,
  timelineSpec,
} from "../src/lib/pets/slime-wearable-import-contract.mjs";
import {
  anchorTrackKey,
  applyTransform,
  decodeFrames,
  framesEqual,
  parseSheetMetadata,
} from "../src/lib/pets/slime-wearable-frame-parser.mjs";

export const toPosix = (value) => value.split(path.sep).join("/");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listDirectories(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Map a source timeline directory name to the runtime timeline key. */
export function timelineKey(timeline) {
  return timeline.startsWith("drink-")
    ? timeline.replace(/^drink-/, "drink:")
    : timeline;
}

/** Read every color variant of one (role, option, timeline) cell. */
export async function readTimelineCell(
  overlaysRoot,
  labelRoot,
  role,
  option,
  timeline,
) {
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
    const parsed = parseSheetMetadata(
      relative,
      await readJson(jsonPath),
      frameCount,
      canvasHeight,
    );
    variants.push({
      color,
      buffer,
      digest: sha256(buffer),
      relative,
      ...parsed,
    });
  }
  if (variants.length === 0) return null;
  if (variants.length !== SLIME_COLORS.length) {
    throw new Error(
      `Incomplete color coverage for ${role}/${option}/${timeline}: ${variants.map((v) => v.color).join(", ")}`,
    );
  }

  const durationSets = new Set(
    variants.map((variant) => JSON.stringify(variant.durations)),
  );
  if (durationSets.size !== 1) {
    throw new Error(
      `Frame durations differ across colors for ${role}/${option}/${timeline}`,
    );
  }

  return {
    role,
    option,
    timeline,
    key: timelineKey(timeline),
    frameCount,
    canvasHeight,
    variants,
  };
}

/**
 * Emit the sheet metadata the mobile asset validator pairs with every PNG.
 *
 * Anchor data lives in the generated registry, but the on-disk validator checks
 * PNG/JSON pairs without evaluating the Metro registry, so each sheet carries
 * its own frame rectangles and durations.
 */
export function sheetMetadata(durations, canvasHeight = CANVAS.height) {
  return {
    frames: durations.map((duration, index) => ({
      filename: `${index}`,
      frame: {
        x: index * CANVAS.width,
        y: 0,
        w: CANVAS.width,
        h: canvasHeight,
      },
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

/**
 * Verify that a wearable option is fully reproducible from its idle sheet.
 *
 * For every color, timeline, and frame this recomputes
 * `idle[transform.sourceFrame]` shifted by `(dx, dy)` and compares it to the
 * authored sheet pixel for pixel. Only after that holds everywhere does the
 * importer drop the derived drink sheets.
 */
export async function verifyIdleDerivation(
  role,
  option,
  idleCell,
  derivedCells,
) {
  const idleFramesByColor = new Map();
  for (const variant of idleCell.variants) {
    idleFramesByColor.set(
      variant.color,
      await decodeFrames(
        variant.buffer,
        variant.relative,
        idleCell.frameCount,
        idleCell.canvasHeight,
      ),
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
        const expected = applyTransform(
          idleFrames[transform.sourceFrame],
          transform,
        );
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
export function buildEntry(role, option, cells) {
  const timelines = {};
  const sheets = new Map();
  const present = new Set(cells.map((cell) => cell.timeline));
  for (const cell of cells) {
    const tracks = new Map();
    for (const variant of cell.variants)
      tracks.set(variant.color, variant.transforms);
    // A timeline that only replays another timeline's frames stores no sheet of
    // its own. That is what lets a new drink flavor ship as an anchor track with
    // no new wearable art.
    const derivesFrom = timelineSpec(cell.timeline).derivesFrom;
    const sheetTimeline =
      derivesFrom && present.has(derivesFrom) ? derivesFrom : cell.timeline;
    timelines[cell.key] = {
      sheet: sheetTimeline,
      tracksByColor: Object.fromEntries(
        SLIME_COLORS.map((color) => [color, tracks.get(color)]),
      ),
    };
    if (sheetTimeline === cell.timeline) {
      sheets.set(cell.timeline, {
        durations: cell.variants[0].durations,
        frameCount: cell.frameCount,
        canvasHeight: cell.canvasHeight,
        buffersByColor: Object.fromEntries(
          cell.variants.map((v) => [v.color, v.buffer]),
        ),
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
export function validateEntry(entry) {
  for (const [key, timeline] of Object.entries(entry.timelines)) {
    const sheet = entry.sheets.get(timeline.sheet);
    if (!sheet) {
      throw new Error(
        `${entry.key} timeline ${key} references missing sheet ${timeline.sheet}`,
      );
    }
    const lengths = new Set(
      SLIME_COLORS.map((color) => timeline.tracksByColor[color]?.length),
    );
    if (lengths.size !== 1 || lengths.has(undefined)) {
      throw new Error(
        `${entry.key} timeline ${key} has inconsistent anchor track lengths across colors`,
      );
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
      throw new Error(
        `${entry.key} sheet ${timeline} has ${sheet.durations.length} durations for ${sheet.frameCount} frames`,
      );
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

export async function generateNearestFourX(buffer, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("Unable to read overlay dimensions");
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
export function timelinePayload(timeline) {
  const { tracksByColor } = timeline;
  const byTrack = new Map();
  for (const color of SLIME_COLORS) {
    const key = anchorTrackKey(tracksByColor[color]);
    if (!byTrack.has(key))
      byTrack.set(key, { track: tracksByColor[color], colors: [] });
    byTrack.get(key).colors.push(color);
  }
  const ranked = [...byTrack.values()].sort(
    (a, b) => b.colors.length - a.colors.length,
  );
  const overrides = {};
  for (const group of ranked.slice(1)) {
    for (const color of group.colors) overrides[color] = group.track;
  }
  const payload = { sheet: timeline.sheet, anchors: ranked[0].track };
  if (Object.keys(overrides).length > 0)
    payload.anchorOverridesByColor = overrides;
  return payload;
}

export function entryLiteral(entry, sheetsField) {
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
export function webSheetsField(entry) {
  const base = `/creatures/slimes/official/composition/${entry.role}/${entry.option}`;
  const colorSensitive = !IDLE_DERIVED_ROLES.has(entry.role);
  return {
    sheets: Object.fromEntries(
      [...entry.sheets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([timeline, sheet]) => [
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
                    SLIME_COLORS.map((color) => [
                      color,
                      `${base}/${timeline}/${color}/sheet.png`,
                    ]),
                  ),
                }
              : { url: `${base}/${timeline}/sheet.png` }),
          },
        ]),
    ),
  };
}

export function renderMobileRegistry(entries) {
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
                (color) =>
                  `${color}: require(${JSON.stringify(`${base}/${timeline}/${color}/sheet.png`)})`,
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
