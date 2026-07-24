import { SLIME_MOBILE_ANIMATION_MANIFEST } from "./slime-assets.generated";

export const SLIME_SHARED_ASSETS = SLIME_MOBILE_ANIMATION_MANIFEST.shared;

export const SLIME_ASSET_COLORS = SLIME_MOBILE_ANIMATION_MANIFEST.colors;
export type SlimeColor = (typeof SLIME_ASSET_COLORS)[number];

export const SLIME_EVOLUTIONS = SLIME_MOBILE_ANIMATION_MANIFEST.evolutions;
export type SlimeEvolution = (typeof SLIME_EVOLUTIONS)[number];

export const EQUIPPED_FLOORS = ["none", "grass-floor", "water-puddle", "trampoline"] as const;
export type EquippedFloor = (typeof EQUIPPED_FLOORS)[number];

export const SLIME_ACTIONS = ["idle", "happy", "drink", "floor-interaction"] as const;
export type SlimeAction = (typeof SLIME_ACTIONS)[number];

export type SlimeFloorInteraction = Extract<EquippedFloor, "water-puddle" | "trampoline">;
export const SLIME_SHEET_ACTIONS = SLIME_MOBILE_ANIMATION_MANIFEST.actions;
export type SlimeSheetAction = (typeof SLIME_SHEET_ACTIONS)[number];
export type SlimeAssetKey = `${SlimeEvolution}/${SlimeColor}/${SlimeSheetAction}`;
export type SlimeCrownOverlayKey = `${Exclude<SlimeEvolution, "base">}/${SlimeColor}`;

export type SlimeFrameRect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type SlimeFrame = Readonly<{
  filename: string;
  frame: SlimeFrameRect;
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: Readonly<{ x: number; y: number; w: number; h: number }>;
  sourceSize: Readonly<{ w: number; h: number }>;
  duration: number;
}>;
export type SlimeSheetMetadata = Readonly<{
  frames: readonly SlimeFrame[];
  meta: Readonly<{
    image: string;
    format: string;
    size: Readonly<{ w: number; h: number }>;
    scale: string;
    frameTags?: readonly Readonly<Record<string, unknown>>[];
    layers?: readonly Readonly<Record<string, unknown>>[];
  }>;
}>;

type GeneratedMobileEntry = (typeof SLIME_MOBILE_ANIMATION_MANIFEST.assets)[keyof typeof SLIME_MOBILE_ANIMATION_MANIFEST.assets];
type GeneratedMobileOverlay = (typeof SLIME_MOBILE_ANIMATION_MANIFEST.crownOverlays)[keyof typeof SLIME_MOBILE_ANIMATION_MANIFEST.crownOverlays];

export type SlimeMobileAssetEntry = Readonly<{
  key: SlimeAssetKey;
  evolution: SlimeEvolution;
  color: SlimeColor;
  action: SlimeSheetAction;
  sheet: unknown;
  imageScale: 4;
  metadata: SlimeSheetMetadata;
}>;

export type SlimeCrownOverlay = Readonly<{
  key: SlimeCrownOverlayKey;
  overlay: unknown;
  imageScale: 4;
  differingPixels: number;
}>;

export type SlimeStaticFloor = Readonly<{
  key: "grass-floor";
  image: unknown;
  imageScale: 4;
  surfaceY: number;
  slimeFootY: number;
}>;

export type SlimePlayback = Readonly<{
  loop: boolean;
  oneShot: boolean;
}>;

export type SlimeAssetState = Readonly<{
  slimeColor: SlimeColor;
  evolution: SlimeEvolution;
  action: SlimeAction;
  equippedFloor: EquippedFloor;
}>;

export type SlimeAssetResolution = Readonly<{
  key: SlimeAssetKey;
  assetKey: SlimeAssetKey;
  requestedEvolution: SlimeEvolution;
  resolvedEvolution: SlimeEvolution;
  slimeColor: SlimeColor;
  action: SlimeAction;
  resolvedAction: SlimeSheetAction;
  equippedFloor: EquippedFloor;
  sheet: unknown;
  source: unknown;
  imageScale: 4;
  metadata: SlimeSheetMetadata;
  frameCount: number;
  frameSize: SlimeFrameRect;
  crownOverlay: SlimeCrownOverlay | null;
  overlay: SlimeCrownOverlay | null;
  staticFloor: SlimeStaticFloor | null;
  playback: SlimePlayback;
  loop: boolean;
  oneShot: boolean;
}>;

const mobileEntries = SLIME_MOBILE_ANIMATION_MANIFEST.assets as Record<string, GeneratedMobileEntry>;
const mobileOverlays = SLIME_MOBILE_ANIMATION_MANIFEST.crownOverlays as Record<string, GeneratedMobileOverlay>;

const isCrowned = (evolution: SlimeEvolution): evolution is Exclude<SlimeEvolution, "base"> => evolution !== "base";

function sheetKey(evolution: SlimeEvolution, color: SlimeColor, action: SlimeSheetAction): SlimeAssetKey {
  return `${evolution}/${color}/${action}` as SlimeAssetKey;
}

function overlayKey(evolution: SlimeEvolution, color: SlimeColor): SlimeCrownOverlayKey | null {
  return isCrowned(evolution) ? `${evolution}/${color}` as SlimeCrownOverlayKey : null;
}

function normalizedFrameIndex(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  if (!Number.isFinite(frameIndex)) return 0;
  const normalized = Math.trunc(frameIndex) % frameCount;
  return normalized < 0 ? normalized + frameCount : normalized;
}

function playbackFor(action: SlimeSheetAction): SlimePlayback {
  return SLIME_MOBILE_ANIMATION_MANIFEST.playbackByAction[action];
}

function staticFloorFor(equippedFloor: EquippedFloor): SlimeStaticFloor | null {
  return equippedFloor === "grass-floor" ? {
    key: "grass-floor",
    image: SLIME_MOBILE_ANIMATION_MANIFEST.shared.grassFloor.image,
    imageScale: SLIME_MOBILE_ANIMATION_MANIFEST.imageScale,
    surfaceY: SLIME_MOBILE_ANIMATION_MANIFEST.shared.grassFloor.surfaceY,
    slimeFootY: SLIME_MOBILE_ANIMATION_MANIFEST.shared.grassFloor.slimeFootY,
  } : null;
}

function generatedEntry(key: SlimeAssetKey): SlimeMobileAssetEntry {
  const entry = mobileEntries[key];
  if (!entry) throw new Error(`Missing imported slime asset: ${key}`);
  return entry as SlimeMobileAssetEntry;
}

function generatedOverlay(key: SlimeCrownOverlayKey | null): SlimeCrownOverlay | null {
  if (!key) return null;
  const overlay = mobileOverlays[key];
  if (!overlay) throw new Error(`Missing imported slime crown overlay: ${key}`);
  return overlay as SlimeCrownOverlay;
}

export function slimeAssetKey(
  evolution: SlimeEvolution,
  slimeColor: SlimeColor,
  action: SlimeSheetAction,
): SlimeAssetKey {
  return sheetKey(evolution, slimeColor, action);
}

/** Resolve persisted state to a literal Metro asset without dynamic require. */
export function resolveSlimeAsset(state: SlimeAssetState): SlimeAssetResolution {
  const floorAction = state.action === "floor-interaction"
    && (state.equippedFloor === "water-puddle" || state.equippedFloor === "trampoline")
    ? state.equippedFloor
    : null;
  const resolvedAction: SlimeSheetAction = floorAction ?? (state.action === "happy" ? "happy" : state.action === "drink" ? "drink" : "idle");
  const usesBaseWithOverlay = isCrowned(state.evolution) && (resolvedAction === "idle" || resolvedAction === "happy");
  const resolvedEvolution: SlimeEvolution = usesBaseWithOverlay ? "base" : state.evolution;
  const key = sheetKey(resolvedEvolution, state.slimeColor, resolvedAction);
  const entry = generatedEntry(key);
  const metadata = entry.metadata;
  const firstFrame = metadata.frames[0];
  if (!firstFrame) throw new Error(`Imported slime asset has no frames: ${key}`);
  const crownOverlay = usesBaseWithOverlay ? generatedOverlay(overlayKey(state.evolution, state.slimeColor)) : null;
  const playback = playbackFor(resolvedAction);
  return {
    key,
    assetKey: key,
    requestedEvolution: state.evolution,
    resolvedEvolution,
    slimeColor: state.slimeColor,
    action: state.action,
    resolvedAction,
    equippedFloor: state.equippedFloor,
    sheet: entry.sheet,
    source: entry.sheet,
    imageScale: 4,
    metadata,
    frameCount: metadata.frames.length,
    frameSize: firstFrame.frame,
    crownOverlay,
    overlay: crownOverlay,
    staticFloor: staticFloorFor(state.equippedFloor),
    playback,
    loop: playback.loop,
    oneShot: playback.oneShot,
  };
}

export function getSlimeFrame(resolution: Pick<SlimeAssetResolution, "metadata">, frameIndex: number): SlimeFrame {
  const frames = resolution.metadata.frames;
  return frames[normalizedFrameIndex(frameIndex, frames.length)] ?? frames[0];
}

export function getSlimeFrameDuration(resolution: Pick<SlimeAssetResolution, "metadata">, frameIndex: number): number {
  return getSlimeFrame(resolution, frameIndex).duration;
}

export const resolveSlimeAssetState = resolveSlimeAsset;
export const getSlimeAssetFrame = getSlimeFrame;
