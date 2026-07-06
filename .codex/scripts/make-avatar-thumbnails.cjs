#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PARTS_DIR = path.join(process.cwd(), "public", "avatar", "parts");
const THUMB_DIR = path.join(process.cwd(), "public", "avatar", "thumbnails");
const THUMB_SIZE = 128;
const ALPHA_THRESHOLD = 1;

async function makeThumbnail(partPath) {
  const name = path.basename(partPath);
  const outPath = path.join(THUMB_DIR, name);

  const metadata = await sharp(partPath).metadata();
  const frameW = 222;
  const frameH = 444;
  if (metadata.width < frameW || metadata.height < frameH) {
    throw new Error(`${name} is smaller than one frame (${frameW}x${frameH})`);
  }

  // Use the first frame as the canonical preview.
  const firstFrame = await sharp(partPath)
    .extract({ left: 0, top: 0, width: frameW, height: frameH })
    .png()
    .toBuffer();

  // Trim transparent margins so small accessories are not lost in a huge canvas.
  const trimmed = await sharp(firstFrame)
    .trim({ threshold: ALPHA_THRESHOLD })
    .png()
    .toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();

  // Scale up small accessories so they remain legible at 128x128.
  const scale = Math.min(
    THUMB_SIZE / trimmedMeta.width,
    THUMB_SIZE / trimmedMeta.height,
    4,
  );
  const renderW = Math.max(1, Math.round(trimmedMeta.width * scale));
  const renderH = Math.max(1, Math.round(trimmedMeta.height * scale));

  const scaled = await sharp(trimmed)
    .resize(renderW, renderH, { kernel: "nearest" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: "center" }])
    .png()
    .toFile(outPath);

  console.log(outPath);
}

async function main() {
  if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
  }

  const partFiles = fs
    .readdirSync(PARTS_DIR)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort()
    .map((name) => path.join(PARTS_DIR, name));

  for (const partPath of partFiles) {
    await makeThumbnail(partPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
