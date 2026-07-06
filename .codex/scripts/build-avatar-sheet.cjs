#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function usage() {
  console.error(
    "Usage: node build-avatar-sheet.cjs [item-directory] [--gender male|female]",
  );
  process.exit(1);
}

function loadTemplate(templateKey) {
  const templatePath = path.join(
    process.cwd(),
    "public",
    "avatar",
    "templates",
    templateKey,
    "template.json",
  );
  const anchorsPath = path.join(
    process.cwd(),
    "public",
    "avatar",
    "templates",
    templateKey,
    "anchors.json",
  );
  return {
    template: JSON.parse(fs.readFileSync(templatePath, "utf8")),
    anchors: JSON.parse(fs.readFileSync(anchorsPath, "utf8")),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const itemArg = args.find((arg) => !arg.startsWith("--") && arg !== "male" && arg !== "female");
  const itemDirs = itemArg
    ? [path.resolve(itemArg)]
    : fs
        .readdirSync(path.join(process.cwd(), "assets", "avatar", "source", "items"), {
          withFileTypes: true,
        })
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          path.join(process.cwd(), "assets", "avatar", "source", "items", entry.name),
        )
        .filter((dir) => fs.existsSync(path.join(dir, "manifest.json")));

  if (itemDirs.length === 0) usage();

  const genderFlag = args.indexOf("--gender");
  const genderArg = genderFlag >= 0 ? args[genderFlag + 1] : undefined;
  for (const itemDir of itemDirs) {
    await buildItem(itemDir, genderArg);
  }
}

async function buildItem(itemDir, genderArg) {
  const manifestPath = path.join(itemDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const { template, anchors } = loadTemplate(
    manifest.bodyTemplate || "aura-body-v1",
  );
  const requestedGender = genderArg;

  const sourcePath = path.join(itemDir, manifest.source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`source not found: ${sourcePath}`);
  }
  const sourceBuf = fs.readFileSync(sourcePath);
  const pivot = manifest.pivot || { x: 0, y: 0 };
  const anchorName = manifest.anchor;

  const composites = [];
  const genderRows = Object.entries(template.genderRows || { male: 0, female: 1 }).filter(
    ([gender]) => !requestedGender || gender === requestedGender,
  );
  for (const [gender, row] of genderRows) {
    const genderData = anchors.genders[gender];
    if (!genderData) {
      throw new Error(`unknown gender: ${gender}`);
    }
    for (const [frameName, frameAnchors] of Object.entries(genderData.frames)) {
      const col = template.frames[frameName]?.col;
      if (col === undefined) continue;
      const anchor = frameAnchors[anchorName];
      if (!anchor) {
        throw new Error(
          `anchor "${anchorName}" missing for ${gender} ${frameName}`,
        );
      }
      composites.push({
        input: sourceBuf,
        left: col * template.frameWidth + anchor.x - pivot.x,
        top: row * template.frameHeight + anchor.y - pivot.y,
      });
    }
  }

  const outPath = path.join(
    process.cwd(),
    "public",
    "avatar",
    "parts",
    `${manifest.key}.png`,
  );
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
    .toFile(outPath);

  console.log(outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
