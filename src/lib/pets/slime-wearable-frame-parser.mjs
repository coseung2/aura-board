import sharp from "sharp";
import { CANVAS } from "./slime-wearable-import-contract.mjs";

export async function decodeFrames(buffer, relative, frameCount, canvasHeight = CANVAS.height) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const expectedWidth = CANVAS.width * frameCount;
  if (info.width !== expectedWidth || info.height !== canvasHeight) {
    throw new Error(
      `Unexpected sheet dimensions for ${relative}: ${info.width}x${info.height}, ` +
        `expected ${expectedWidth}x${canvasHeight}`,
    );
  }
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const pixels = new Map();
    for (let y = 0; y < canvasHeight; y += 1) {
      for (let x = 0; x < CANVAS.width; x += 1) {
        const sheetX = frameIndex * CANVAS.width + x;
        const offset = (y * info.width + sheetX) * 4;
        if (data[offset + 3] === 0) continue;
        pixels.set(
          `${x},${y}`,
          `${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`,
        );
      }
    }
    frames.push(pixels);
  }
  return frames;
}

export function applyTransform(frame, transform) {
  const moved = new Map();
  for (const [position, color] of frame) {
    const [x, y] = position.split(",").map(Number);
    moved.set(`${x + transform.dx},${y + transform.dy}`, color);
  }
  return moved;
}

export function framesEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [position, color] of a) {
    if (b.get(position) !== color) return false;
  }
  return true;
}

export function anchorTrackKey(transforms) {
  return transforms.map((transform) => `${transform.sourceFrame}:${transform.dx}:${transform.dy}`).join("|");
}

function parseTransforms(relative, meta, frameCount) {
  if (!Array.isArray(meta.transforms)) throw new Error(`Missing meta.transforms in ${relative}`);
  if (meta.transforms.length !== frameCount) {
    throw new Error(`Expected ${frameCount} transforms in ${relative}, found ${meta.transforms.length}`);
  }
  return meta.transforms.map((transform, index) => {
    for (const field of ["source_idle_frame", "dx", "dy"]) {
      if (!Number.isSafeInteger(transform?.[field])) {
        throw new Error(`Invalid transforms[${index}].${field} in ${relative}`);
      }
    }
    const sourceFrame = transform.source_idle_frame;
    if (sourceFrame < 0 || sourceFrame >= frameCount) {
      throw new Error(`transforms[${index}].source_idle_frame out of range in ${relative}: ${sourceFrame}`);
    }
    return { sourceFrame, dx: transform.dx, dy: transform.dy };
  });
}

export function parseSheetMetadata(relative, parsed, frameCount, canvasHeight = CANVAS.height) {
  if (!Array.isArray(parsed?.frames) || !parsed?.meta) {
    throw new Error(`Invalid composition JSON schema: ${relative}`);
  }
  const { meta } = parsed;
  if (meta.frame_count !== frameCount || parsed.frames.length !== frameCount) {
    throw new Error(`Expected ${frameCount} frames in ${relative}`);
  }
  if (meta.frame_size?.w !== CANVAS.width || meta.frame_size?.h !== canvasHeight) {
    throw new Error(`Unexpected frame size in ${relative}: expected ${CANVAS.width}x${canvasHeight}`);
  }
  if (meta.size?.w !== CANVAS.width * frameCount || meta.size?.h !== canvasHeight) {
    throw new Error(`Unexpected sheet size in ${relative}`);
  }
  const durations = parsed.frames.map((frame, index) => {
    if (!Number.isFinite(frame?.duration) || frame.duration < 0) {
      throw new Error(`Invalid frame ${index} duration in ${relative}`);
    }
    return frame.duration;
  });
  return { durations, transforms: parseTransforms(relative, meta, frameCount), meta };
}
