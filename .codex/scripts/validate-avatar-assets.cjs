#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const specPath = path.join(process.cwd(), "public", "avatar", "avatar-spec.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

const templatePath = path.join(
  process.cwd(),
  "public",
  "avatar",
  "templates",
  "aura-body-v1",
  "template.json",
);
const anchorsPath = path.join(
  process.cwd(),
  "public",
  "avatar",
  "templates",
  "aura-body-v1",
  "anchors.json",
);

const template = fs.existsSync(templatePath)
  ? JSON.parse(fs.readFileSync(templatePath, "utf8"))
  : null;
const anchors = fs.existsSync(anchorsPath)
  ? JSON.parse(fs.readFileSync(anchorsPath, "utf8"))
  : null;

const partsDir = path.join(process.cwd(), "public", "avatar", "parts");
const partFiles = fs.existsSync(partsDir)
  ? fs
      .readdirSync(partsDir)
      .filter((name) => name.toLowerCase().endsWith(".png"))
      .sort()
      .map((name) => path.join("public", "avatar", "parts", name))
  : [];
const baseBody = path.join("public", "avatar", "base-body-sprite.png");
const assets = fs.existsSync(baseBody) ? [baseBody, ...partFiles] : partFiles;

function frameBbox(data, info, frameW, frameH, col, row) {
  let minX = frameW;
  let minY = frameH;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frameH; y += 1) {
    for (let x = 0; x < frameW; x += 1) {
      const gx = col * frameW + x;
      const gy = row * frameH + y;
      const a = data[(gy * info.width + gx) * 4 + 3];
      if (a > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function frameAnchorsFor(frame) {
  if (!anchors) return null;
  const gender = frame.row === 1 ? "female" : "male";
  const frameName = `idle_${String(frame.col).padStart(2, "0")}`;
  return anchors.genders?.[gender]?.frames?.[frameName] ?? null;
}

async function inspect(file) {
  const metadata = await sharp(file).metadata();
  const problems = [];
  if (metadata.width !== spec.sheetWidth) {
    problems.push(`width ${metadata.width} != ${spec.sheetWidth}`);
  }
  if (metadata.height !== spec.sheetHeight) {
    problems.push(`height ${metadata.height} != ${spec.sheetHeight}`);
  }
  if (!metadata.hasAlpha) {
    problems.push("missing alpha channel");
  }

  const { data, info } = await sharp(file)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const frameW = spec.frameWidth;
  const frameH = spec.frameHeight;
  const cols = info.width / frameW;
  const rows = info.height / frameH;
  const frames = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const bbox = frameBbox(data, info, frameW, frameH, col, row);
      frames.push({ row, col, bbox });
    }
  }

  const fitChecks = [];
  const name = path.basename(file);
  if (name === "sunglasses-basic.png" && anchors) {
    for (const frame of frames) {
      if (!frame.bbox) continue;
      const frameAnchors = frameAnchorsFor(frame);
      if (!frameAnchors) continue;
      const points = [
        { anchor: "eyeLeft", actual: { x: frame.bbox.x + 27, y: frame.bbox.y + 9 } },
        { anchor: "eyeRight", actual: { x: frame.bbox.x + 68, y: frame.bbox.y + 9 } },
        { anchor: "eyeBridge", actual: { x: frame.bbox.x + 48, y: frame.bbox.y + 9 } },
      ];
      for (const point of points) {
        const expected = frameAnchors[point.anchor];
        if (!expected) continue;
        const d = distance(point.actual, expected);
        fitChecks.push({
          frame: `${frame.row}:${frame.col}`,
          anchor: point.anchor,
          expected,
          actual: point.actual,
          distance: Math.round(d * 100) / 100,
        });
      }
    }
  }
  if ((name === "default-bottom.png" || name === "default-shoes.png") && anchors) {
    const anchorName = name === "default-bottom.png" ? "waistband" : "feet";
    for (const frame of frames) {
      if (!frame.bbox) continue;
      const frameAnchors = frameAnchorsFor(frame);
      const expected = frameAnchors?.[anchorName];
      if (!expected) continue;
      const actual = { x: frame.bbox.x, y: frame.bbox.y };
      const d = distance(actual, expected);
      fitChecks.push({
        frame: `${frame.row}:${frame.col}`,
        anchor: anchorName,
        expected: { x: expected.x, y: expected.y },
        actual,
        distance: Math.round(d * 100) / 100,
      });
    }
  }

  return {
    file,
    ok: problems.length === 0,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    frames,
    fitChecks,
    problems,
  };
}

async function main() {
  const results = [];
  for (const file of assets) {
    if (!fs.existsSync(file)) {
      results.push({ file, ok: false, problems: ["missing file"] });
      continue;
    }
    results.push(await inspect(file));
  }

  // Surface fit warnings/errors. Existing non-production parts are allowed to
  // warn; sunglasses must pass once they are re-baked.
  const warnings = [];
  const errors = [];
  for (const result of results) {
    for (const check of result.fitChecks) {
      if (check.distance > 30) {
        errors.push(`${result.file} frame ${check.frame}: ${check.anchor} distance ${check.distance}px`);
      } else if (check.distance > 8) {
        warnings.push(`${result.file} frame ${check.frame}: ${check.anchor} distance ${check.distance}px`);
      }
    }
  }

  for (const warning of warnings) console.warn("WARNING:", warning);
  for (const error of errors) console.error("ERROR:", error);

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0 || errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
