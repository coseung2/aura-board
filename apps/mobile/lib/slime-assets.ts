import { SLIME_MOBILE_ANIMATION_MANIFEST } from "./slime-assets.generated";
import { SLIME_MOBILE_STATIC_FLOORS } from "./static-floors.generated";
import {
  resolveSlimeComposition,
  resolveSlimeHeadSlot,
  type SlimeCompositionDecision,
  type SlimeHeadSlot,
} from "./slime-wearables";

export const SLIME_SHARED_ASSETS = SLIME_MOBILE_ANIMATION_MANIFEST.shared;

export const SLIME_ASSET_COLORS = SLIME_MOBILE_ANIMATION_MANIFEST.colors;
export type SlimeColor = (typeof SLIME_ASSET_COLORS)[number];

export const SLIME_EVOLUTIONS = SLIME_MOBILE_ANIMATION_MANIFEST.evolutions;
export type SlimeEvolution = (typeof SLIME_EVOLUTIONS)[number];

export const EQUIPPED_FLOORS = [
  "none",
  "grass-floor",
  "crystal-cave-floor",
  "moonlit-marble-floor",
  "royal-garden-floor",
  "celestial-gold-floor",
  "snow-ground-floor",
  "ancient-brick-floor",
  "cherry-stone-floor",
  "sand-trail-floor",
  "forest-soil-floor",
  "stone-floor",
  "water-puddle",
  "trampoline",
] as const;
export type EquippedFloor = (typeof EQUIPPED_FLOORS)[number];

export const SLIME_ACTIONS = ["idle", "happy", "drink", "floor-interaction"] as const;
export type SlimeAction = (typeof SLIME_ACTIONS)[number];

export type SlimeFloorInteraction = Extract<EquippedFloor, "water-puddle" | "trampoline">;

/**
 * Sheet variants present on disk, as reported by the generated manifest.
 *
 * Drinking is authored per flavor because the pose differs, so these names are
 * flavor-specific (`drink-lemonade`).
 */
export const SLIME_SHEET_VARIANTS = SLIME_MOBILE_ANIMATION_MANIFEST.actions;
export type SlimeSheetVariant = (typeof SLIME_SHEET_VARIANTS)[number];

/**
 * Semantic animation the pet is playing.
 *
 * `drink` is one action regardless of flavor; the flavor selects art, not
 * behaviour. Wearable anchor tracks are keyed off this, which is what keeps one
 * flavor's sheet from standing in for another.
 */
export type SlimeSheetAction = "idle" | "happy" | "drink" | SlimeFloorInteraction;

/** Retained name for the sheet variant list. */
export const SLIME_SHEET_ACTIONS = SLIME_SHEET_VARIANTS;
export type SlimeAssetKey = `${SlimeEvolution}/${SlimeColor}/${SlimeSheetVariant}`;
export type SlimeCrownOverlayKey = `${Exclude<SlimeEvolution, "base">}/${SlimeColor}`;

/**
 * Flavor used when a drink is requested without naming one, matching the web
 * resolver. Lemonade is the flavor every evolution authored.
 */
export const DEFAULT_SLIME_DRINK_FLAVOR = "lemonade";

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
type GeneratedHappyHeartOverlay = (typeof SLIME_MOBILE_ANIMATION_MANIFEST.happyHeartOverlays)[keyof typeof SLIME_MOBILE_ANIMATION_MANIFEST.happyHeartOverlays];

export type SlimeMobileAssetEntry = Readonly<{
  key: SlimeAssetKey;
  evolution: SlimeEvolution;
  color: SlimeColor;
  action: SlimeSheetVariant;
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

export type SlimeHappyHeartOverlay = Readonly<{
  key: `base/${SlimeColor}`;
  evolution: "base";
  color: SlimeColor;
  action: "happy";
  sheet: unknown;
  imageScale: 4;
  metadata: SlimeSheetMetadata;
}>;

export type SlimeStaticFloor = Readonly<{
  key: Exclude<EquippedFloor, "none" | "water-puddle" | "trampoline">;
  image: unknown;
  imageScale: 4;
  surfaceY: number;
  slimeFootY: number;
  tier?: 1 | 2 | 3;
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
  /** Growth stage driving the awarded crown. Defaults from `evolution`. */
  growthStage?: number;
  /** Player-selected headwear, which outranks the growth crown. */
  equippedHeadwear?: string | null;
  /** Drink flavor selecting the wearable drink timeline. */
  drinkFlavor?: string | null;
}>;

export type SlimeAssetResolution = Readonly<{
  key: SlimeAssetKey;
  assetKey: SlimeAssetKey;
  requestedEvolution: SlimeEvolution;
  resolvedEvolution: SlimeEvolution;
  slimeColor: SlimeColor;
  action: SlimeAction;
  resolvedAction: SlimeSheetAction;
  /** Sheet variant actually loaded, which names the flavor for a drink. */
  resolvedVariant: SlimeSheetVariant;
  /** Flavor driving the drink sheet and the wearable drink timelines. */
  drinkFlavor: string | null;
  equippedFloor: EquippedFloor;
  sheet: unknown;
  source: unknown;
  imageScale: 4;
  metadata: SlimeSheetMetadata;
  frameCount: number;
  frameSize: SlimeFrameRect;
  /** Which head option is semantically worn, regardless of what this action draws. */
  headSlot: SlimeHeadSlot;
  /** The head option this action actually draws, or null when suppressed. */
  renderedHeadwear: string | null;
  /** Why the frame is composed, baked, or drawn bare-headed. */
  composition: SlimeCompositionDecision;
  staticFloor: SlimeStaticFloor | null;
  playback: SlimePlayback;
  loop: boolean;
  oneShot: boolean;
  /** Heart-only happy animation, rendered after every wearable layer. */
  happyHeart: SlimeHappyHeartOverlay | null;
}>;

const mobileEntries = SLIME_MOBILE_ANIMATION_MANIFEST.assets as Record<string, GeneratedMobileEntry>;
const mobileOverlays = SLIME_MOBILE_ANIMATION_MANIFEST.crownOverlays as Record<string, GeneratedMobileOverlay>;

const isCrowned = (evolution: SlimeEvolution): evolution is Exclude<SlimeEvolution, "base"> => evolution !== "base";

function sheetKey(
  evolution: SlimeEvolution,
  color: SlimeColor,
  variant: SlimeSheetVariant,
): SlimeAssetKey {
  return `${evolution}/${color}/${variant}` as SlimeAssetKey;
}

/**
 * Name the sheet variant one semantic action loads. Only drinking is
 * flavor-specific on disk; everything else names its own sheet.
 */
function sheetVariantFor(
  action: SlimeSheetAction,
  drinkFlavor: string | null,
): SlimeSheetVariant {
  if (action !== "drink") return action as SlimeSheetVariant;
  return `drink-${drinkFlavor ?? DEFAULT_SLIME_DRINK_FLAVOR}` as SlimeSheetVariant;
}

function overlayKey(evolution: SlimeEvolution, color: SlimeColor): SlimeCrownOverlayKey | null {
  return isCrowned(evolution) ? `${evolution}/${color}` as SlimeCrownOverlayKey : null;
}

/**
 * Infer a growth stage from a persisted evolution, so snapshots that only carry
 * `evolution` resolve to the same crown as before.
 */
function growthStageForEvolution(evolution: SlimeEvolution): number {
  if (evolution === "gold-crown-red-gem") return 3;
  if (evolution === "silver-crown-blue-gem") return 2;
  return 1;
}

function normalizedFrameIndex(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  if (!Number.isFinite(frameIndex)) return 0;
  const normalized = Math.trunc(frameIndex) % frameCount;
  return normalized < 0 ? normalized + frameCount : normalized;
}

function playbackFor(variant: SlimeSheetVariant): SlimePlayback {
  return SLIME_MOBILE_ANIMATION_MANIFEST.playbackByAction[variant];
}

function staticFloorFor(equippedFloor: EquippedFloor): SlimeStaticFloor | null {
  if (equippedFloor === "grass-floor") return {
    key: "grass-floor",
    image: SLIME_MOBILE_ANIMATION_MANIFEST.shared.grassFloor.image,
    imageScale: SLIME_MOBILE_ANIMATION_MANIFEST.imageScale,
    surfaceY: SLIME_MOBILE_ANIMATION_MANIFEST.shared.grassFloor.surfaceY,
    slimeFootY: SLIME_MOBILE_ANIMATION_MANIFEST.shared.grassFloor.slimeFootY,
  };
  return SLIME_MOBILE_STATIC_FLOORS[
    equippedFloor as keyof typeof SLIME_MOBILE_STATIC_FLOORS
  ] ?? null;
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
  variant: SlimeSheetVariant,
): SlimeAssetKey {
  return sheetKey(evolution, slimeColor, variant);
}

/** Resolve persisted state to a literal Metro asset without dynamic require. */
export function resolveSlimeAsset(state: SlimeAssetState): SlimeAssetResolution {
  const floorAction = state.action === "floor-interaction"
    && (state.equippedFloor === "water-puddle" || state.equippedFloor === "trampoline")
    ? state.equippedFloor
    : null;
  const resolvedAction: SlimeSheetAction = floorAction ?? (state.action === "happy" ? "happy" : state.action === "drink" ? "drink" : "idle");
  // A drink names its own sheet, so the flavor is resolved before any lookup.
  const drinkFlavor = resolvedAction === "drink"
    ? state.drinkFlavor ?? DEFAULT_SLIME_DRINK_FLAVOR
    : null;
  const resolvedVariant = sheetVariantFor(resolvedAction, drinkFlavor);

  // Growth stage stays authoritative for level display and buffs; here it only
  // supplies the default crown. A player-selected hat outranks it in the same
  // headwear slot, and removing the hat restores the crown.
  const growthStage = state.growthStage ?? growthStageForEvolution(state.evolution);
  const headSlot = resolveSlimeHeadSlot(growthStage, state.equippedHeadwear);
  const composition = resolveSlimeComposition(resolvedAction, headSlot, drinkFlavor);

  // Composed frames draw the plain base sheet and add overlays. `baked` keeps the
  // pre-composited evolved sheet, but only where one was actually authored: the
  // evolved package has no idle or happy sheets, so those fall back to base.
  const bakedKey = sheetKey(state.evolution, state.slimeColor, resolvedVariant);
  const hasBakedSheet = isCrowned(state.evolution) && Boolean(mobileEntries[bakedKey]);
  const resolvedEvolution: SlimeEvolution =
    composition.mode === "baked" && hasBakedSheet ? state.evolution : "base";
  const renderedHeadwear = composition.headwear === "drawn" ? headSlot?.option ?? null : null;
  const key = sheetKey(resolvedEvolution, state.slimeColor, resolvedVariant);
  const entry = generatedEntry(key);
  const metadata = entry.metadata;
  const firstFrame = metadata.frames[0];
  if (!firstFrame) throw new Error(`Imported slime asset has no frames: ${key}`);
  const playback = playbackFor(resolvedVariant);
  return {
    key,
    assetKey: key,
    requestedEvolution: state.evolution,
    resolvedEvolution,
    slimeColor: state.slimeColor,
    action: state.action,
    resolvedAction,
    resolvedVariant,
    drinkFlavor,
    equippedFloor: state.equippedFloor,
    sheet: entry.sheet,
    source: entry.sheet,
    imageScale: 4,
    metadata,
    frameCount: metadata.frames.length,
    frameSize: firstFrame.frame,
    headSlot,
    renderedHeadwear,
    composition,
    staticFloor: staticFloorFor(state.equippedFloor),
    playback,
    loop: playback.loop,
    oneShot: playback.oneShot,
    happyHeart: resolvedAction === "happy"
      ? SLIME_MOBILE_ANIMATION_MANIFEST.happyHeartOverlays[`base/${state.slimeColor}`] as GeneratedHappyHeartOverlay
      : null,
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
