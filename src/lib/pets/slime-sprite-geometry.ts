/**
 * Shared logical geometry for web OfficialSlimeSprite.
 *
 * Mobile stores physical 4x sheets and multiplies by displayScale. Web stores
 * 1x logical sheets and multiplies by an integer renderer scale. Both must land
 * on the same logical coordinates for every color, growth stage, and vehicle.
 */

export const SLIME_LOGICAL_FRAME = 64;
/** Matches apps/mobile/theme/tokens.ts slimeUi.vehicleSceneScale */
export const SLIME_SCENE_SCALE = 1.5;
/** Matches apps/mobile/theme/tokens.ts slimeUi.vehicleFloorScale */
export const SLIME_FLOOR_SCALE = 1.125;
/** Matches apps/mobile/theme/tokens.ts slimeUi.vehicleFrameWidth */
export const SLIME_VEHICLE_FRAME_WIDTH = 64;

export const SLIME_DEFAULT_RENDERER_SCALE = 1;
/**
 * Student home hero: integer scale that fills the 240px scene well without CSS
 * transforms. 2x of the expanded 96px scene is exactly 192px.
 */
export const SLIME_HOME_HERO_RENDERER_SCALE = 2;

export type SlimeSpriteGeometry = {
  rendererScale: number;
  baseWidth: number;
  baseHeight: number;
  sceneScale: number;
  floorScale: number;
  sceneWidth: number;
  sceneHeight: number;
  sceneInsetX: number;
  sceneInsetY: number;
  floorWidth: number;
  floorHeight: number;
  floorInsetX: number;
  vehicleRise: number;
  vehicleBob: number;
  riderOffsetY: number;
  vehicleTop: number;
  vehicleLeft: number;
  vehicleCanvasHeight: number;
  vehicleFrameWidth: number;
  viewportWidth: number;
  expandedFloorTop: number;
  totalRise: number;
  floorRise: number;
};

export function normalizeSlimeRendererScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return SLIME_DEFAULT_RENDERER_SCALE;
  return Math.max(1, Math.round(value as number));
}

/**
 * Largest integer renderer scale that fits a logical scene into a CSS host
 * without fractional CSS transforms or stretching.
 */
export function fitSlimeRendererScale(
  logicalSceneSize: number,
  maxCssPixels: number,
): number {
  const scene = Math.max(1, Math.trunc(logicalSceneSize));
  const host = Math.max(0, Math.trunc(maxCssPixels));
  if (host < scene) return 1;
  return Math.max(1, Math.floor(host / scene));
}

export function slimeSourceSize(
  sourceWidth: number,
  sourceHeight: number,
  rendererScale: number,
): { width: number; height: number } {
  const scale = normalizeSlimeRendererScale(rendererScale);
  return {
    width: Math.trunc(sourceWidth) * scale,
    height: Math.trunc(sourceHeight) * scale,
  };
}

export function slimeFrameOffset(
  frame: {
    frame: { x: number; y: number };
    spriteSourceSize: { x: number; y: number };
  },
  rendererScale: number,
  offsetY = 0,
): { left: number; top: number } {
  const scale = normalizeSlimeRendererScale(rendererScale);
  return {
    left: (frame.spriteSourceSize.x - frame.frame.x) * scale,
    top: (frame.spriteSourceSize.y - frame.frame.y) * scale + offsetY,
  };
}

export function resolveSlimeSpriteGeometry(input: {
  sourceWidth: number;
  sourceHeight: number;
  rendererScale?: number;
  expandedScene?: boolean;
  floorRiseSourcePixels?: number;
  vehicleRiseY?: number;
  vehicleBobY?: number;
  vehicleCharacterOffsetY?: number;
  vehicleOffsetX?: number;
  vehicleCanvasHeight?: number;
  staticFloor?: {
    slimeFootY: number;
    surfaceY: number;
    imageScale?: number;
  } | null;
}): {
  geometry: SlimeSpriteGeometry;
  viewportHeight: number;
} {
  const rendererScale = normalizeSlimeRendererScale(input.rendererScale);
  const base = slimeSourceSize(input.sourceWidth, input.sourceHeight, rendererScale);
  const expanded = Boolean(input.expandedScene);
  const sceneScale = expanded ? SLIME_SCENE_SCALE : 1;
  const floorScale = expanded ? SLIME_FLOOR_SCALE : 1;
  const sceneWidth = base.width * sceneScale;
  const sceneHeight = base.height * sceneScale;
  const sceneInsetX = (sceneWidth - base.width) / 2;
  const sceneInsetY = (sceneHeight - base.height) / 2;
  const floorWidth = base.width * floorScale;
  const floorHeight = base.height * floorScale;
  const floorInsetX = (sceneWidth - floorWidth) / 2;
  const floorRise = input.staticFloor
    ? (input.staticFloor.slimeFootY - input.staticFloor.surfaceY) * rendererScale
    : Math.max(0, Math.trunc(input.floorRiseSourcePixels ?? 0)) * rendererScale;
  const vehicleRise = Math.max(0, Math.trunc(input.vehicleRiseY ?? 0)) * rendererScale;
  const vehicleBob = Math.trunc(input.vehicleBobY ?? 0) * rendererScale;
  // Authored bob values use screen coordinates: negative is upward.
  const riderOffsetY = -vehicleRise + vehicleBob;
  const vehicleTop =
    -Math.trunc(input.vehicleCharacterOffsetY ?? 0) * rendererScale;
  const vehicleLeft = Math.trunc(input.vehicleOffsetX ?? 0) * rendererScale;
  const vehicleCanvasHeight = Math.max(
    SLIME_LOGICAL_FRAME,
    Math.trunc(input.vehicleCanvasHeight ?? SLIME_LOGICAL_FRAME),
  );
  const expandedFloorTop = input.staticFloor
    ? sceneInsetY
      + input.staticFloor.slimeFootY * rendererScale
      - input.staticFloor.surfaceY * rendererScale * floorScale
    : 0;
  const totalRise = floorRise + vehicleRise;
  const viewportHeight = Math.max(
    sceneHeight,
    sceneInsetY + base.height + totalRise,
    input.staticFloor ? expandedFloorTop + floorHeight : 0,
  );

  return {
    geometry: {
      rendererScale,
      baseWidth: base.width,
      baseHeight: base.height,
      sceneScale,
      floorScale,
      sceneWidth,
      sceneHeight,
      sceneInsetX,
      sceneInsetY,
      floorWidth,
      floorHeight,
      floorInsetX,
      vehicleRise,
      vehicleBob,
      riderOffsetY,
      vehicleTop,
      vehicleLeft,
      vehicleCanvasHeight,
      vehicleFrameWidth: SLIME_VEHICLE_FRAME_WIDTH * rendererScale,
      viewportWidth: sceneWidth,
      expandedFloorTop,
      totalRise,
      floorRise,
    },
    viewportHeight,
  };
}

export function studentHomeHeroRendererScale(hasScene: boolean): number {
  // Scene and avatar both use the same integer scale so dashboard CSS never
  // needs a second-stage transform.
  void hasScene;
  return SLIME_HOME_HERO_RENDERER_SCALE;
}
