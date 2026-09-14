import type { SlimeSpriteGeometry } from "./slime-sprite-geometry";
import type { ResolvedSlimeWearable } from "./slime-wearables";

/** Stable union of whole frame viewports across the vehicle's animation cycle. */
export function participantSceneBounds(g: SlimeSpriteGeometry, height: number, hasVehicle: boolean, bob: readonly number[], wearables: readonly ResolvedSlimeWearable[]) {
  const minBob = Math.min(0, ...bob) * g.rendererScale;
  const maxBob = Math.max(0, ...bob) * g.rendererScale;
  const top = -g.vehicleRise + minBob;
  const bottom = -g.vehicleRise + maxBob;
  const boxes = [
    { x: 0, y: 0, w: g.sceneWidth, h: height },
    { x: 0, y: top, w: g.sceneWidth, h: g.sceneHeight + bottom - top },
  ];
  if (hasVehicle) boxes.push({ x: g.sceneInsetX + g.vehicleLeft, y: g.sceneInsetY + g.vehicleTop, w: g.vehicleFrameWidth, h: g.vehicleCanvasHeight * g.rendererScale });
  for (const wearable of wearables) boxes.push({
    x: g.sceneInsetX + wearable.dx * g.rendererScale,
    y: g.sceneInsetY + (wearable.dy - wearable.characterOffsetY) * g.rendererScale + top,
    w: wearable.frameSize.w * g.rendererScale,
    h: wearable.frameSize.h * g.rendererScale + bottom - top,
  });
  const x = Math.min(...boxes.map(b => b.x));
  const y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.w)) - x, height: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
