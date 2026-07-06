#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const templateKey = "aura-body-v1";
const root = process.cwd();
const templateDir = path.join(root, "public", "avatar", "templates", templateKey);
const template = JSON.parse(fs.readFileSync(path.join(templateDir, "template.json"), "utf8"));
const anchors = JSON.parse(fs.readFileSync(path.join(templateDir, "anchors.json"), "utf8"));
const maskKeys = ["eyes", "mouth", "torso_top", "waistband", "feet"];

function rectSvg({ x, y, w, h }) {
  return Buffer.from(
    `<svg width="${template.sheetWidth}" height="${template.sheetHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/></svg>`,
  );
}

async function buildMask(gender, key) {
  const genderData = anchors.genders?.[gender];
  if (!genderData) throw new Error(`Missing anchors for gender: ${gender}`);
  const row = genderData.row;
  const composites = [];
  for (const [frameName, frame] of Object.entries(genderData.frames || {})) {
    const col = template.frames?.[frameName]?.col;
    const rect = frame[key];
    if (col === undefined || !rect) continue;
    composites.push({
      input: rectSvg({
        x: col * template.frameWidth + rect.x,
        y: row * template.frameHeight + rect.y,
        w: rect.w,
        h: rect.h,
      }),
      left: 0,
      top: 0,
    });
  }
  const out = path.join(templateDir, "masks", `${gender}-${key}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({
    create: {
      width: template.sheetWidth,
      height: template.sheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(out);
  console.log(out);
}

async function main() {
  for (const gender of Object.keys(anchors.genders || {})) {
    for (const key of maskKeys) await buildMask(gender, key);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
