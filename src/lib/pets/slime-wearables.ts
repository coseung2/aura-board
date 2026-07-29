import {
  SLIME_WEARABLE_LAYER_ORDER,
  SLIME_WEB_WEARABLE_REGISTRY,
} from "./slime-wearables.generated";
import { SLIME_WEB_WEARABLE_ACTION_REGISTRY } from "./slime-wearable-actions.generated";
import type { SlimeColor, SlimeSheetAction } from "./slime-assets";

/**
 * Colors this module validates against.
 *
 * Deliberately a local list rather than an import of the asset registry's
 * runtime value: `slime-assets` consumes this module for head-slot resolution,
 * and a value import would close that cycle.
 */
const WEARABLE_COLORS: readonly SlimeColor[] = ["blue", "green", "yellow", "purple", "red"];

export { SLIME_WEARABLE_LAYER_ORDER };

/** Overlay roles above the character layer, ordered bottom to top. */
export const SLIME_WEARABLE_ROLES = ["blush", "eyewear", "headwear", "drink"] as const;
export type SlimeWearableRole = (typeof SLIME_WEARABLE_ROLES)[number];

/** Roles the player equips from the shop. `drink` is driven by the prop slot. */
export const SLIME_EQUIPPABLE_ROLES = ["blush", "eyewear", "headwear"] as const;
export type SlimeEquippableRole = (typeof SLIME_EQUIPPABLE_ROLES)[number];

/**
 * Headwear awarded by growth stage rather than bought.
 *
 * This is the gameplay rule, so it lives here rather than being inferred from
 * asset names: renaming a crown option must be a deliberate change here, not a
 * silent behavior change. Stage 1 has no crown.
 */
export const GROWTH_HEADWEAR_BY_STAGE = {
  2: "silver-crown-blue-gem",
  3: "gold-crown-red-gem",
} as const;

export type SlimeGrowthCrownStage = keyof typeof GROWTH_HEADWEAR_BY_STAGE;

export type SlimeWearableAnchor = Readonly<{
  /** Index into the option's idle sheet supplying this frame's pixels. */
  sourceFrame: number;
  dx: number;
  dy: number;
}>;

export type SlimeWearableTimeline = Readonly<{
  /** Which stored sheet these anchors index into. */
  sheet: string;
  anchors: readonly SlimeWearableAnchor[];
  anchorOverridesByColor?: Readonly<Partial<Record<SlimeColor, readonly SlimeWearableAnchor[]>>>;
}>;

/**
 * One stored sheet, shared across colors unless the role is color-sensitive.
 *
 * `frameCount` is how many source columns an anchor's `sourceFrame` may address.
 * That is deliberately separate from a timeline's rendered length, which is its
 * anchor track length: a longer action may legitimately replay a shorter sheet.
 */
export type SlimeWearableSheet = Readonly<{
  frameCount: number;
  frameSize: Readonly<{ w: number; h: number }>;
  /**
   * Vertical offset of the character inside this sheet's canvas.
   *
   * Zero for grounded actions, which share the 64px character canvas. Positive
   * for jump actions, whose taller canvas adds headroom above the grounded pose,
   * so the overlay must shift up by this amount to align with the viewport.
   */
  characterOffsetY: number;
  /** False for the jump actions that leave the floor on a taller canvas. */
  grounded: boolean;
  url?: string;
  urlByColor?: Readonly<Record<SlimeColor, string>>;
}>;

export type SlimeWearableEntry = Readonly<{
  key: string;
  role: SlimeWearableRole;
  option: string;
  published: boolean;
  vendoredSource: boolean;
  zIndex: number;
  colorSensitive: boolean;
  sheets: Readonly<Record<string, SlimeWearableSheet>>;
  timelines: Readonly<Record<string, SlimeWearableTimeline>>;
}>;

/** One wearable layer resolved for a single rendered frame. */
export type ResolvedSlimeWearable = Readonly<{
  key: string;
  role: SlimeWearableRole;
  option: string;
  imageUrl: string;
  zIndex: number;
  /** Sheet column supplying the pixels for this frame. */
  sourceFrame: number;
  dx: number;
  dy: number;
  /** Addressable source columns in the stored sheet, not the rendered length. */
  sheetFrameCount: number;
  frameSize: Readonly<{ w: number; h: number }>;
  /** Subtract from the vertical placement so jump canvases align with the viewport. */
  characterOffsetY: number;
  grounded: boolean;
  sheetWidth: number;
  sheetHeight: number;
}>;

export type SlimeWearableSelection = Readonly<{
  headwear?: string | null;
  eyewear?: string | null;
  blush?: string | null;
  drink?: string | null;
}>;

/** Which head option wins, and why. Independent of what an action can draw. */
export type SlimeHeadSlot = Readonly<{
  option: string;
  source: "equipped" | "growth";
}> | null;

/**
 * Whether the current action draws composed layers at all.
 *
 * `composed` draws the base sheet plus anchor layers. `baked` uses a
 * pre-composited evolved sheet, which is exact but cannot host any overlay.
 *
 * This is a scene-level decision, so it must never be driven by one layer's
 * capability: an evolved slime drinking grape soda would otherwise fall back to
 * the lemonade-only baked sheet just because the crown lacks a grape track.
 * Per-layer gaps are reported through `headwear` instead.
 */
export type SlimeCompositionMode = "composed" | "baked";

/** Why the head slot is or is not drawn on this action. */
export type SlimeHeadwearRendering = "drawn" | "suppressed" | "baked-in" | "empty";

export type SlimeCompositionDecision = Readonly<{
  mode: SlimeCompositionMode;
  headwear: SlimeHeadwearRendering;
  reason?: "unsupported-action";
}>;

/** Actions with authored wearable anchors at all. */
export function slimeActionSupportsWearables(action: SlimeSheetAction): boolean {
  // Every action can host overlays now that the jump canvases carry an offset.
  // Per-option coverage is checked separately; `"any"` only stands in for a
  // flavor so a drink reports supportability without naming one.
  return slimeWearableTimelineKey(action, "any") !== null;
}

/** Whether one option has an authored track for this action. */
export function slimeWearableCoversAction(
  role: SlimeWearableRole,
  option: string,
  action: SlimeSheetAction,
  drinkFlavor?: string | null,
): boolean {
  const timelineKey = slimeWearableTimelineKey(action, drinkFlavor);
  if (!timelineKey) return false;
  return Boolean(slimeWearableEntry(role, option)?.timelines[timelineKey]);
}

/**
 * Resolve which head option is semantically worn.
 *
 * A player-selected hat always wins over the growth crown, and removing the hat
 * restores the crown, because both occupy the single headwear slot. Growth stage
 * itself is untouched: it still drives level display and buffs.
 */
export function resolveSlimeHeadSlot(
  growthStage: number,
  equippedHeadwear?: string | null,
): SlimeHeadSlot {
  if (equippedHeadwear) return { option: equippedHeadwear, source: "equipped" };
  const stage = Math.trunc(growthStage);
  for (const candidate of [3, 2] as const) {
    if (stage >= candidate) {
      return { option: GROWTH_HEADWEAR_BY_STAGE[candidate], source: "growth" };
    }
  }
  return null;
}

/**
 * Decide how one action renders, and separately whether the head slot is drawn.
 *
 * The scene composes whenever the action has authored anchors at all, so a drink
 * always shows the flavor the player chose. Only when no overlay is possible does
 * it fall back to a baked sheet.
 *
 * The head slot is then resolved independently:
 *
 * - `drawn`: the option has a track for this action.
 * - `suppressed`: it does not, and the player chose it. Omitting the hat is
 *   better than substituting the growth crown, which the player did not pick.
 * - `baked-in`: the growth crown has no track but the baked sheet already draws
 *   it, so the crown still appears without an overlay.
 * - `empty`: nothing is worn.
 */
export function resolveSlimeComposition(
  action: SlimeSheetAction,
  headSlot: SlimeHeadSlot,
  drinkFlavor?: string | null,
): SlimeCompositionDecision {
  if (!slimeActionSupportsWearables(action)) {
    // No overlay is possible, so the baked sheet is the only exact option. It
    // carries the crown itself, and a chosen hat cannot be drawn over it.
    return {
      mode: "baked",
      headwear: headSlot?.source === "growth" ? "baked-in" : headSlot ? "suppressed" : "empty",
      reason: "unsupported-action",
    };
  }

  if (!headSlot) return { mode: "composed", headwear: "empty" };
  const covered = slimeWearableCoversAction("headwear", headSlot.option, action, drinkFlavor);
  if (covered) return { mode: "composed", headwear: "drawn" };
  return { mode: "composed", headwear: "suppressed", reason: "unsupported-action" };
}

const baseRegistry = SLIME_WEB_WEARABLE_REGISTRY as unknown as Record<string, SlimeWearableEntry>;
const actionRegistry = SLIME_WEB_WEARABLE_ACTION_REGISTRY as unknown as Record<
  string,
  Pick<SlimeWearableEntry, "sheets" | "timelines">
>;
const registry = Object.fromEntries(
  Object.entries(baseRegistry).map(([key, entry]) => {
    const actions = actionRegistry[key];
    return [key, actions ? {
      ...entry,
      sheets: { ...entry.sheets, ...actions.sheets },
      timelines: { ...entry.timelines, ...actions.timelines },
    } : entry];
  }),
) as Record<string, SlimeWearableEntry>;

function entryKey(role: SlimeWearableRole, option: string): string {
  return `${role}/${option}`;
}

export function slimeWearableEntry(
  role: SlimeWearableRole,
  option: string,
): SlimeWearableEntry | null {
  return registry[entryKey(role, option)] ?? null;
}

/** List importable options for a role, optionally including unpublished art. */
export function slimeWearableOptions(
  role: SlimeWearableRole,
  { includeUnpublished = false }: { includeUnpublished?: boolean } = {},
): readonly string[] {
  return Object.values(registry)
    .filter((entry) => entry.role === role && (includeUnpublished || entry.published))
    .map((entry) => entry.option)
    .sort();
}

/**
 * Map a character action to the overlay timeline key.
 *
 * Every character action has a key, including the jump floors. Their overlays are
 * authored on a taller canvas, which the sheet's `characterOffsetY` accounts for
 * rather than excluding them. A drink needs its flavor to name a timeline.
 *
 * Whether a specific option actually carries the returned timeline is a separate
 * question, answered by `slimeWearableCoversAction`.
 */
export function slimeWearableTimelineKey(
  action: SlimeSheetAction,
  drinkFlavor?: string | null,
): string | null {
  if (action === "drink") return drinkFlavor ? `drink:${drinkFlavor}` : null;
  return action;
}

function anchorsFor(
  timeline: SlimeWearableTimeline,
  slimeColor: SlimeColor,
): readonly SlimeWearableAnchor[] {
  return timeline.anchorOverridesByColor?.[slimeColor] ?? timeline.anchors;
}

function sheetFor(entry: SlimeWearableEntry, timeline: SlimeWearableTimeline): SlimeWearableSheet {
  const sheet = entry.sheets[timeline.sheet];
  if (!sheet) throw new Error(`Missing sheet ${timeline.sheet} for ${entry.key}`);
  return sheet;
}

function imageUrlFor(
  entry: SlimeWearableEntry,
  sheet: SlimeWearableSheet,
  slimeColor: SlimeColor,
): string {
  if (entry.colorSensitive) {
    const url = sheet.urlByColor?.[slimeColor];
    if (!url) throw new Error(`Missing color sheet for ${entry.key} (${slimeColor})`);
    return url;
  }
  if (!sheet.url) throw new Error(`Missing shared sheet for ${entry.key}`);
  return sheet.url;
}

function normalizedFrameIndex(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  if (!Number.isFinite(frameIndex)) return 0;
  const normalized = Math.trunc(frameIndex) % frameCount;
  return normalized < 0 ? normalized + frameCount : normalized;
}

/**
 * Resolve every equipped wearable layer for one rendered frame.
 *
 * Returns an empty list for actions without authored overlays (the jump floor
 * timelines), which keeps those animations rendering exactly as before.
 */
export function resolveSlimeWearables(
  selection: SlimeWearableSelection,
  slimeColor: SlimeColor,
  action: SlimeSheetAction,
  frameIndex: number,
  drinkFlavor?: string | null,
): readonly ResolvedSlimeWearable[] {
  const timelineKey = slimeWearableTimelineKey(action, drinkFlavor);
  if (!timelineKey) return [];
  if (!(WEARABLE_COLORS as readonly string[]).includes(slimeColor)) {
    throw new Error(`Unknown slime color: ${slimeColor}`);
  }

  const resolved: ResolvedSlimeWearable[] = [];
  for (const role of SLIME_WEARABLE_ROLES) {
    const option = selection[role];
    if (!option) continue;
    const entry = slimeWearableEntry(role, option);
    if (!entry) continue;
    const timeline = entry.timelines[timelineKey];
    if (!timeline) continue;
    const sheet = sheetFor(entry, timeline);
    const anchors = anchorsFor(timeline, slimeColor);
    const anchor = anchors[normalizedFrameIndex(frameIndex, anchors.length)];
    if (!anchor) continue;
    resolved.push({
      key: entry.key,
      role: entry.role,
      option: entry.option,
      imageUrl: imageUrlFor(entry, sheet, slimeColor),
      zIndex: entry.zIndex,
      sourceFrame: anchor.sourceFrame,
      dx: anchor.dx,
      dy: anchor.dy,
      sheetFrameCount: sheet.frameCount,
      frameSize: sheet.frameSize,
      characterOffsetY: sheet.characterOffsetY,
      grounded: sheet.grounded,
      sheetWidth: sheet.frameSize.w * sheet.frameCount,
      sheetHeight: sheet.frameSize.h,
    });
  }
  return resolved.sort((a, b) => a.zIndex - b.zIndex);
}
