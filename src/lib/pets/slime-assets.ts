import {
  SLIME_WEB_ASSET_REGISTRY,
  SLIME_WEB_CROWN_OVERLAY_REGISTRY,
  SLIME_WEB_SHARED_ASSETS,
} from "./slime-assets.generated";
import {
  SLIME_BALL_WEB_ASSET_REGISTRY,
} from "./slime-ball-assets.generated";
import type { SlimeBallSlug } from "./types";
export const SLIME_SHARED_ASSETS = SLIME_WEB_SHARED_ASSETS;
export {
  SLIME_BALL_ASSET_REGISTRY,
  SLIME_BALL_WEB_ASSET_REGISTRY,
} from "./slime-ball-assets.generated";

export const SLIME_ASSET_COLORS = ["blue", "green", "yellow", "purple", "red"] as const;
export type SlimeColor = (typeof SLIME_ASSET_COLORS)[number];

export const SLIME_EVOLUTIONS = ["base", "gold-crown-red-gem", "silver-crown-blue-gem"] as const;
export type SlimeEvolution = (typeof SLIME_EVOLUTIONS)[number];

export const EQUIPPED_FLOORS = ["none", "grass-floor", "water-puddle", "trampoline"] as const;
export type EquippedFloor = (typeof EQUIPPED_FLOORS)[number];

export const SLIME_ACTIONS = ["idle", "happy", "drink", "floor-interaction"] as const;
export type SlimeAction = (typeof SLIME_ACTIONS)[number];

export type SlimeFloorInteraction = Extract<EquippedFloor, "water-puddle" | "trampoline">;
export type SlimeSheetAction = "idle" | "happy" | "drink" | SlimeFloorInteraction;
export type SlimeAssetKey = `${SlimeEvolution}/${SlimeColor}/${SlimeSheetAction}`;
export type SlimeCrownOverlayKey = `${Exclude<SlimeEvolution, "base">}/${SlimeColor}`;
export type SlimeBallAssetKey = `${SlimeBallSlug}/${SlimeColor}`;

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

type GeneratedBallEntry = (typeof SLIME_BALL_WEB_ASSET_REGISTRY)[keyof typeof SLIME_BALL_WEB_ASSET_REGISTRY];

export type SlimeBallAssetEntry = Readonly<{
  key: SlimeBallAssetKey;
  slug: SlimeBallSlug;
  color: SlimeColor;
  sheetUrl: string;
  sheet4xUrl: string;
  gifUrl: string;
  gif4xUrl: string;
  metadata: SlimeSheetMetadata;
}>;

export type SlimeBallAssetState = Readonly<{
  slimeColor: SlimeColor;
  ballSlug: SlimeBallSlug;
}>;

export type SlimeBallAssetResolution = SlimeBallAssetEntry & Readonly<{
  ballSlug: SlimeBallSlug;
  slimeColor: SlimeColor;
  frameCount: number;
  frameSize: SlimeFrameRect;
  playback: SlimePlayback;
  loop: true;
  oneShot: false;
}>;

type GeneratedWebEntry = (typeof SLIME_WEB_ASSET_REGISTRY)[keyof typeof SLIME_WEB_ASSET_REGISTRY];
type GeneratedWebOverlay = (typeof SLIME_WEB_CROWN_OVERLAY_REGISTRY)[keyof typeof SLIME_WEB_CROWN_OVERLAY_REGISTRY];
export type SlimeWebAssetEntry = Readonly<{
  key: SlimeAssetKey;
  evolution: SlimeEvolution;
  color: SlimeColor;
  action: SlimeSheetAction;
  sheetUrl: string;
  metadata: SlimeSheetMetadata;
}>;

export type SlimeCrownOverlay = Readonly<{
  key: SlimeCrownOverlayKey;
  imageUrl: string;
  imageScale: number;
  differingPixels: number;
}>;

export type SlimeStaticFloor = Readonly<{
  key: "grass-floor";
  imageUrl: string;
  imageScale: 1;
  surfaceY: 44;
  slimeFootY: 56;
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
  /** Optional prop selected for the current slime. */
  equippedBall?: SlimeBallSlug | null;
  /** Alias accepted while older persisted snapshots migrate. */
  ballSlug?: SlimeBallSlug | null;
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
  sheetUrl: string;
  imageScale: 1;
  metadata: SlimeSheetMetadata;
  frameCount: number;
  frameSize: SlimeFrameRect;
  crownOverlay: SlimeCrownOverlay | null;
  overlay: SlimeCrownOverlay | null;
  staticFloor: SlimeStaticFloor | null;
  playback: SlimePlayback;
  loop: boolean;
  oneShot: boolean;
  ball: SlimeBallAssetResolution | null;
}>;

const webEntries = SLIME_WEB_ASSET_REGISTRY as Record<string, GeneratedWebEntry>;
const webOverlays = SLIME_WEB_CROWN_OVERLAY_REGISTRY as Record<string, GeneratedWebOverlay>;
const ballEntries = SLIME_BALL_WEB_ASSET_REGISTRY as Record<string, GeneratedBallEntry>;

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
  return action === "idle" || action === "water-puddle" || action === "trampoline"
    ? { loop: true, oneShot: false }
    : { loop: false, oneShot: true };
}

function staticFloorFor(equippedFloor: EquippedFloor): SlimeStaticFloor | null {
  return equippedFloor === "grass-floor" ? {
    key: "grass-floor",
    imageUrl: SLIME_WEB_SHARED_ASSETS.grassFloor.imageUrl,
    imageScale: 1,
    surfaceY: 44,
    slimeFootY: 56,
  } : null;
}

function generatedEntry(key: SlimeAssetKey): SlimeWebAssetEntry {
  const entry = webEntries[key];
  if (!entry) throw new Error(`Missing imported slime asset: ${key}`);
  return entry as SlimeWebAssetEntry;
}

function generatedOverlay(key: SlimeCrownOverlayKey | null): SlimeCrownOverlay | null {
  if (!key) return null;
  const overlay = webOverlays[key];
  if (!overlay) throw new Error(`Missing imported slime crown overlay: ${key}`);
  return overlay as SlimeCrownOverlay;
}

function ballKey(slug: SlimeBallSlug, slimeColor: SlimeColor): SlimeBallAssetKey {
  return `${slug}/${slimeColor}` as SlimeBallAssetKey;
}

function generatedBallEntry(key: SlimeBallAssetKey): SlimeBallAssetEntry {
  const entry = ballEntries[key];
  if (!entry) throw new Error(`Missing imported slime ball asset: ${key}`);
  return entry as SlimeBallAssetEntry;
}

export function slimeBallAssetKey(
  ballSlug: SlimeBallSlug,
  slimeColor: SlimeColor,
): SlimeBallAssetKey;
export function slimeBallAssetKey(
  slimeColor: SlimeColor,
  ballSlug: SlimeBallSlug,
): SlimeBallAssetKey;
export function slimeBallAssetKey(
  first: SlimeBallSlug | SlimeColor,
  second: SlimeBallSlug | SlimeColor,
): SlimeBallAssetKey {
  const isColor = (value: string): value is SlimeColor =>
    (SLIME_ASSET_COLORS as readonly string[]).includes(value);
  return isColor(first)
    ? ballKey(second as SlimeBallSlug, first)
    : ballKey(first as SlimeBallSlug, second as SlimeColor);
}

export function resolveSlimeBallAsset(state: SlimeBallAssetState): SlimeBallAssetResolution;
export function resolveSlimeBallAsset(
  slimeColor: SlimeColor,
  ballSlug: SlimeBallSlug,
): SlimeBallAssetResolution;
export function resolveSlimeBallAsset(
  ballSlug: SlimeBallSlug,
  slimeColor: SlimeColor,
): SlimeBallAssetResolution;
export function resolveSlimeBallAsset(
  stateOrFirst: SlimeBallAssetState | SlimeColor | SlimeBallSlug,
  maybeSecond?: SlimeBallSlug | SlimeColor,
): SlimeBallAssetResolution {
  const isColor = (value: string): value is SlimeColor =>
    (SLIME_ASSET_COLORS as readonly string[]).includes(value);
  const slimeColor = typeof stateOrFirst === "string"
    ? isColor(stateOrFirst)
      ? stateOrFirst
      : maybeSecond as SlimeColor
    : stateOrFirst.slimeColor;
  const ballSlug = typeof stateOrFirst === "string"
    ? isColor(stateOrFirst)
      ? maybeSecond as SlimeBallSlug
      : stateOrFirst
    : stateOrFirst.ballSlug;
  if (!ballSlug) throw new Error("A slime ball slug is required to resolve a ball asset");

  const key = ballKey(ballSlug, slimeColor);
  const entry = generatedBallEntry(key);
  const firstFrame = entry.metadata.frames[0];
  if (!firstFrame) throw new Error(`Imported slime ball asset has no frames: ${key}`);
  return {
    ...entry,
    ballSlug,
    slimeColor,
    frameCount: entry.metadata.frames.length,
    frameSize: firstFrame.frame,
    playback: { loop: true, oneShot: false },
    loop: true,
    oneShot: false,
  };
}

export function slimeAssetKey(
  evolution: SlimeEvolution,
  slimeColor: SlimeColor,
  action: SlimeSheetAction,
): SlimeAssetKey {
  return sheetKey(evolution, slimeColor, action);
}

/** Resolve persisted state to an imported sheet without reading the source package. */
export function resolveSlimeAsset(
  state: SlimeAssetState,
  ballSlug?: SlimeBallSlug | null,
): SlimeAssetResolution {
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
  const equippedBall = ballSlug !== undefined ? ballSlug : state.equippedBall ?? state.ballSlug ?? null;
  const result: SlimeAssetResolution = {
    key,
    assetKey: key,
    requestedEvolution: state.evolution,
    resolvedEvolution,
    slimeColor: state.slimeColor,
    action: state.action,
    resolvedAction,
    equippedFloor: state.equippedFloor,
    sheetUrl: entry.sheetUrl,
    imageScale: 1,
    metadata,
    frameCount: metadata.frames.length,
    frameSize: firstFrame.frame,
    crownOverlay,
    overlay: crownOverlay,
    staticFloor: staticFloorFor(state.equippedFloor),
    playback,
    loop: playback.loop,
    oneShot: playback.oneShot,
    ball: equippedBall ? resolveSlimeBallAsset(state.slimeColor, equippedBall) : null,
  };
  return result;
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
