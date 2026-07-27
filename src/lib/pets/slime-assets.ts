import {
  SLIME_WEB_ASSET_REGISTRY,
  SLIME_WEB_CROWN_OVERLAY_REGISTRY,
  SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY,
  SLIME_WEB_SHARED_ASSETS,
} from "./slime-assets.generated";
import { SLIME_WEB_STATIC_FLOORS } from "./static-floors.generated";
import {
  SLIME_BALL_WEB_ASSET_REGISTRY,
} from "./slime-ball-assets.generated";
import type { SlimeBallSlug } from "./types";
import {
  resolveSlimeComposition,
  resolveSlimeHeadSlot,
  type SlimeCompositionDecision,
  type SlimeHeadSlot,
} from "./slime-wearables";
export const SLIME_SHARED_ASSETS = SLIME_WEB_SHARED_ASSETS;
export {
  SLIME_BALL_ASSET_REGISTRY,
  SLIME_BALL_WEB_ASSET_REGISTRY,
} from "./slime-ball-assets.generated";

export const SLIME_ASSET_COLORS = ["blue", "green", "yellow", "purple", "red"] as const;
export type SlimeColor = (typeof SLIME_ASSET_COLORS)[number];

export const SLIME_EVOLUTIONS = ["base", "gold-crown-red-gem", "silver-crown-blue-gem"] as const;
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
 * Semantic animation the pet is playing.
 *
 * `drink` is one action regardless of flavor; the flavor selects art, not
 * behaviour. Wearable anchor tracks are keyed off this.
 */
export type SlimeSheetAction = "idle" | "happy" | "drink" | SlimeFloorInteraction;

/**
 * Character sheet variant on disk.
 *
 * Drinking is authored per flavor because the pose differs, so the sheet name is
 * flavor-specific even though the action above is not. Keeping these two types
 * apart is what stops one flavor's sheet standing in for the others, which is how
 * a lemonade glass previously appeared under every drink.
 */
export type SlimeSheetVariant =
  | "idle"
  | "happy"
  | `drink-${string}`
  | SlimeFloorInteraction;

export type SlimeAssetKey = `${SlimeEvolution}/${SlimeColor}/${SlimeSheetVariant}`;
export type SlimeCrownOverlayKey = `${Exclude<SlimeEvolution, "base">}/${SlimeColor}`;
export type SlimeBallAssetKey = `${SlimeBallSlug}/${SlimeColor}`;

/**
 * Flavor used when a drink is requested without naming one.
 *
 * Older persisted snapshots carry `action: "drink"` with no flavor, and the
 * shop can preview drinking before a flavor is chosen. Those cases need a real
 * sheet, and lemonade is the flavor every evolution authored.
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
type GeneratedHappyHeartOverlay = (typeof SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY)[keyof typeof SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY];
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

export type SlimeHappyHeartOverlay = Readonly<{
  key: `base/${SlimeColor}`;
  evolution: "base";
  color: SlimeColor;
  action: "happy";
  imageUrl: string;
  imageScale: 1;
  metadata: SlimeSheetMetadata;
}>;

export type SlimeStaticFloor = Readonly<{
  key: Exclude<EquippedFloor, "none" | "water-puddle" | "trampoline">;
  imageUrl: string;
  imageScale: 1;
  surfaceY: 44;
  slimeFootY: 56;
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
  /** Optional prop selected for the current slime. */
  equippedBall?: SlimeBallSlug | null;
  /** Alias accepted while older persisted snapshots migrate. */
  ballSlug?: SlimeBallSlug | null;
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
  sheetUrl: string;
  imageScale: 1;
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
  ball: SlimeBallAssetResolution | null;
  /** Heart-only happy animation, rendered after every wearable layer. */
  happyHeart: SlimeHappyHeartOverlay | null;
}>;

const webEntries = SLIME_WEB_ASSET_REGISTRY as Record<string, GeneratedWebEntry>;
const webOverlays = SLIME_WEB_CROWN_OVERLAY_REGISTRY as Record<string, GeneratedWebOverlay>;
const ballEntries = SLIME_BALL_WEB_ASSET_REGISTRY as Record<string, GeneratedBallEntry>;

const isCrowned = (evolution: SlimeEvolution): evolution is Exclude<SlimeEvolution, "base"> => evolution !== "base";

function sheetKey(
  evolution: SlimeEvolution,
  color: SlimeColor,
  variant: SlimeSheetVariant,
): SlimeAssetKey {
  return `${evolution}/${color}/${variant}` as SlimeAssetKey;
}

/**
 * Name the sheet variant one semantic action loads.
 *
 * Only drinking is flavor-specific on disk, because the pose differs per drink.
 * Everything else names its own sheet. Keeping this mapping in one place is what
 * stops a lemonade sheet standing in for a grape soda.
 */
function sheetVariantFor(
  action: SlimeSheetAction,
  drinkFlavor: string | null,
): SlimeSheetVariant {
  if (action !== "drink") return action;
  return `drink-${drinkFlavor ?? DEFAULT_SLIME_DRINK_FLAVOR}` as SlimeSheetVariant;
}

function overlayKey(evolution: SlimeEvolution, color: SlimeColor): SlimeCrownOverlayKey | null {
  return isCrowned(evolution) ? `${evolution}/${color}` as SlimeCrownOverlayKey : null;
}

/**
 * Infer a growth stage from a persisted evolution.
 *
 * Callers that already know the stage should pass it; this keeps older snapshots
 * that only carry `evolution` resolving to the same crown as before.
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

function playbackFor(action: SlimeSheetAction): SlimePlayback {
  return action === "idle" || action === "water-puddle" || action === "trampoline"
    ? { loop: true, oneShot: false }
    : { loop: false, oneShot: true };
}

function staticFloorFor(equippedFloor: EquippedFloor): SlimeStaticFloor | null {
  if (equippedFloor === "grass-floor") return {
    key: "grass-floor",
    imageUrl: SLIME_WEB_SHARED_ASSETS.grassFloor.imageUrl,
    imageScale: 1,
    surfaceY: 44,
    slimeFootY: 56,
  };
  return SLIME_WEB_STATIC_FLOORS[
    equippedFloor as keyof typeof SLIME_WEB_STATIC_FLOORS
  ] ?? null;
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
  variant: SlimeSheetVariant,
): SlimeAssetKey {
  return sheetKey(evolution, slimeColor, variant);
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
  // A drink names its own sheet, so the flavor is resolved before any lookup.
  // A drink requested without a flavor still needs a real sheet, so it falls back
  // to the flavor every evolution authored rather than failing to resolve.
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
  const hasBakedSheet = isCrowned(state.evolution) && Boolean(webEntries[bakedKey]);
  const resolvedEvolution: SlimeEvolution =
    composition.mode === "baked" && hasBakedSheet ? state.evolution : "base";
  const renderedHeadwear = composition.headwear === "drawn" ? headSlot?.option ?? null : null;
  const key = sheetKey(resolvedEvolution, state.slimeColor, resolvedVariant);
  const entry = generatedEntry(key);
  const metadata = entry.metadata;
  const firstFrame = metadata.frames[0];
  if (!firstFrame) throw new Error(`Imported slime asset has no frames: ${key}`);
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
    resolvedVariant,
    drinkFlavor,
    equippedFloor: state.equippedFloor,
    sheetUrl: entry.sheetUrl,
    imageScale: 1,
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
    ball: equippedBall ? resolveSlimeBallAsset(state.slimeColor, equippedBall) : null,
    happyHeart: resolvedAction === "happy"
      ? SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY[`base/${state.slimeColor}`] as GeneratedHappyHeartOverlay
      : null,
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
