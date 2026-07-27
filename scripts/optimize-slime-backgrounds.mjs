#!/usr/bin/env node

/**
 * Re-encode the animated shop backgrounds that mobile downloads.
 *
 * Mobile requested the 256px variants, which summed to roughly 18 MB for the 18
 * shop backgrounds. Opening the shop therefore started an 18 MB burst of animated
 * downloads, which on a weak connection reads as "loads slowly, then never
 * finishes".
 *
 * This script produces 128px variants with FFmpeg rather than a pure-JS encoder,
 * because the size win comes almost entirely from GIF features a naive encoder
 * does not emit:
 *
 * - one animation-wide palette (`palettegen` with `stats_mode=diff`), instead of
 *   a per-frame local color table
 * - transparent inter-frame differencing (`-gifflags +transdiff`), so unchanged
 *   pixels are simply absent from later frames
 * - sub-rectangle frame placement (`+offsetting`, `diff_mode=rectangle`)
 * - disposal method 1, which leaves the previous frame in place; disposal 2
 *   clears it and destroys most of the differencing benefit
 *
 * Measured on the current corpus: 18.09 MB of 256px GIFs becomes about 1.33 MB,
 * with frame counts and total durations preserved exactly.
 *
 * Animation timing is never inferred. Frame count and per-frame durations come
 * from the authoritative source GIF, so a background such as `starry-workshop`
 * that has 69 frames rather than 72 keeps its own timeline.
 */

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backgroundsRoot = path.join(
  projectRoot,
  "public",
  "creatures",
  "slimes",
  "shop",
  "backgrounds",
);

/** Variant this script owns. The 64px web variant is authored upstream. */
const TARGET_SIZE = 128;
const SOURCE_SUFFIX = "-6s-256.gif";
const TARGET_SUFFIX = `-6s-${TARGET_SIZE}.gif`;

/**
 * Encoder arguments, kept in one place so the importer is reproducible.
 *
 * `stats_mode=diff` builds the shared palette from the regions that actually
 * change, and `dither=none` keeps flat pixel-art areas byte-identical between
 * frames, which is what makes the differencing compress well.
 */
function ffmpegArgs(source, target) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-filter_complex",
    `[0:v]scale=${TARGET_SIZE}:${TARGET_SIZE}:flags=neighbor,split[s0][s1];` +
      "[s0]palettegen=max_colors=256:stats_mode=diff[p];" +
      "[s1][p]paletteuse=dither=none:diff_mode=rectangle",
    "-gifflags",
    "+offsetting+transdiff",
    "-global_palette",
    "1",
    "-loop",
    "0",
    target,
  ];
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Read frame count and total duration straight from the GIF byte stream.
 *
 * Parsing here rather than shelling out again keeps the verification independent
 * of the encoder: a re-encode that silently dropped or retimed frames must fail
 * this check.
 */
function readGifTiming(buffer, label) {
  if (buffer.subarray(0, 3).toString("ascii") !== "GIF") {
    throw new Error(`Not a GIF: ${label}`);
  }
  let offset = 13;
  // Skip the global color table when the packed field advertises one.
  if (buffer[10] & 0x80) offset += 3 * (1 << ((buffer[10] & 0x07) + 1));

  let frames = 0;
  let durationMs = 0;
  let pendingDelay = 0;
  const disposals = new Set();

  const skipSubBlocks = () => {
    while (offset < buffer.length) {
      const size = buffer[offset];
      offset += 1;
      if (size === 0) return;
      offset += size;
    }
  };

  while (offset < buffer.length) {
    const marker = buffer[offset];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label2 = buffer[offset + 1];
      offset += 2;
      if (label2 === 0xf9) {
        const blockSize = buffer[offset];
        const packed = buffer[offset + 1];
        disposals.add((packed >> 2) & 0x07);
        pendingDelay = buffer.readUInt16LE(offset + 2) * 10;
        offset += 1 + blockSize;
        skipSubBlocks();
      } else {
        skipSubBlocks();
      }
      continue;
    }
    if (marker === 0x2c) {
      frames += 1;
      durationMs += pendingDelay;
      pendingDelay = 0;
      const packed = buffer[offset + 9];
      offset += 10;
      if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));
      offset += 1; // LZW minimum code size
      skipSubBlocks();
      continue;
    }
    throw new Error(`Unexpected GIF block 0x${marker.toString(16)} in ${label}`);
  }

  if (frames === 0) throw new Error(`No frames found in ${label}`);
  return { frames, durationMs, disposals: [...disposals].sort() };
}

async function listBackgrounds() {
  const entries = await fs.readdir(backgroundsRoot, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(backgroundsRoot, entry.name, "aura-package");
    const files = await fs.readdir(packageDir).catch(() => null);
    if (!files) continue;
    const source = files.find((name) => name.endsWith(SOURCE_SUFFIX));
    if (!source) continue;
    found.push({
      id: entry.name,
      packageDir,
      sourcePath: path.join(packageDir, source),
      targetPath: path.join(packageDir, source.replace(SOURCE_SUFFIX, TARGET_SUFFIX)),
    });
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes("--check");
  if (argv.includes("--help") || argv.includes("-h")) {
    console.error("Usage: node scripts/optimize-slime-backgrounds.mjs [--check]");
    return;
  }

  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-version"]);
  } catch {
    throw new Error("ffmpeg is required on PATH to re-encode the animated backgrounds");
  }

  const backgrounds = await listBackgrounds();
  if (backgrounds.length === 0) throw new Error(`No source backgrounds under ${backgroundsRoot}`);

  const results = [];
  let sourceBytes = 0;
  let targetBytes = 0;

  for (const background of backgrounds) {
    const sourceBuffer = await fs.readFile(background.sourcePath);
    const sourceTiming = readGifTiming(sourceBuffer, background.sourcePath);

    if (!checkOnly) {
      await execFileAsync("ffmpeg", ffmpegArgs(background.sourcePath, background.targetPath));
    }

    const targetBuffer = await fs.readFile(background.targetPath).catch(() => null);
    if (!targetBuffer) {
      throw new Error(`Missing ${TARGET_SIZE}px variant for ${background.id}; run without --check`);
    }
    const targetTiming = readGifTiming(targetBuffer, background.targetPath);

    // The re-encode is a size optimization, never an animation change.
    if (targetTiming.frames !== sourceTiming.frames) {
      throw new Error(
        `${background.id}: re-encode has ${targetTiming.frames} frames against ` +
          `${sourceTiming.frames} in the source`,
      );
    }
    if (targetTiming.durationMs !== sourceTiming.durationMs) {
      throw new Error(
        `${background.id}: re-encode runs ${targetTiming.durationMs}ms against ` +
          `${sourceTiming.durationMs}ms in the source`,
      );
    }
    if (targetBuffer.length >= sourceBuffer.length) {
      throw new Error(
        `${background.id}: ${TARGET_SIZE}px variant is not smaller than its 256px source`,
      );
    }

    sourceBytes += sourceBuffer.length;
    targetBytes += targetBuffer.length;
    results.push({
      id: background.id,
      frames: targetTiming.frames,
      durationMs: targetTiming.durationMs,
      sourceKiB: Math.round(sourceBuffer.length / 1024),
      targetKiB: Math.round(targetBuffer.length / 1024),
      sha256: sha256(targetBuffer),
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: checkOnly ? "check" : "encode",
        backgrounds: results.length,
        sourceTotalMiB: Number((sourceBytes / 1024 / 1024).toFixed(2)),
        targetTotalMiB: Number((targetBytes / 1024 / 1024).toFixed(2)),
        reductionPercent: Number(((1 - targetBytes / sourceBytes) * 100).toFixed(1)),
        largest: results.reduce((worst, item) => (item.targetKiB > worst.targetKiB ? item : worst)),
        results,
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

export { main, readGifTiming };
