import {
  SLIME_MOBILE_WEARABLE_REGISTRY,
  SLIME_WEARABLE_LAYER_ORDER,
} from "./slime-wearables.generated";
import { SLIME_MOBILE_WEARABLE_ACTION_REGISTRY } from "./slime-wearable-actions.generated";
import type { SlimeColor, SlimeSheetAction } from "./slime-assets";

export { SLIME_WEARABLE_LAYER_ORDER };

/** Overlay roles above the character layer, ordered bottom to top. */
export const SLIME_WEARABLE_ROLES = ["blush", "eyewear", "headwear", "drink"] as const;
export type SlimeWearableRole = (typeof SLIME_WEARABLE_ROLES)[number];
export type SlimeWearableAction = SlimeSheetAction | "ball-hit";

/**
 * Headwear awarded by growth stage rather than bought. Kept in step with the
 * web map in `src/lib/pets/slime-wearables.ts`; renaming a crown option must be
 * a deliberate change in both places, never inferred from asset names.
 */
export const GROWTH_HEADWEAR_BY_STAGE = {
  2: "silver-crown-blue-gem",
  3: "gold-crown-red-gem",
} as const;

export type SlimeWearableAnchor = Readonly<{
  sourceFrame: number;
  dx: number;
  dy: number;
}>;

type RegistryEntry = Readonly<{
  key: string;
  role: SlimeWearableRole;
  option: string;
  published: boolean;
  vendoredSource: boolean;
  zIndex: number;
  colorSensitive: boolean;
  frameSize: Readonly<{ w: number; h: number }>;
  imageScale: number;
  sheets: Readonly<
    Record<
      string,
      Readonly<{
        frameCount: number;
        frameSize: Readonly<{ w: number; h: number }>;
        /** Character offset inside this sheet's canvas; positive for jump actions. */
        characterOffsetY: number;
        /** False for the jump actions authored on a taller canvas. */
        grounded: boolean;
        image?: unknown;
        imageByColor?: Readonly<Record<SlimeColor, unknown>>;
      }>
    >
  >;
  timelines: Readonly<
    Record<
      string,
      Readonly<{
        sheet: string;
        frameCount: number;
        anchors: readonly SlimeWearableAnchor[];
        anchorOverridesByColor?: Readonly<Partial<Record<SlimeColor, readonly SlimeWearableAnchor[]>>>;
      }>
    >
  >;
}>;

/** One wearable layer resolved for a single rendered frame. */
export type ResolvedSlimeWearable = Readonly<{
  key: string;
  role: SlimeWearableRole;
  option: string;
  image: unknown;
  zIndex: number;
  sourceFrame: number;
  dx: number;
  dy: number;
  sheetFrameCount: number;
  frameSize: Readonly<{ w: number; h: number }>;
  characterOffsetY: number;
  grounded: boolean;
  imageScale: number;
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
 * Scene-level decision: `composed` draws the base sheet plus anchor layers,
 * `baked` uses the pre-composited evolved sheet. Never driven by one layer's
 * capability, so a chosen drink always shows its own flavor.
 */
export type SlimeCompositionMode = "composed" | "baked";

/** Why the head slot is or is not drawn on this action. */
export type SlimeHeadwearRendering = "drawn" | "suppressed" | "baked-in" | "empty";

export type SlimeCompositionDecision = Readonly<{
  mode: SlimeCompositionMode;
  headwear: SlimeHeadwearRendering;
  reason?: "unsupported-action";
}>;

const baseRegistry = SLIME_MOBILE_WEARABLE_REGISTRY as unknown as Record<string, RegistryEntry>;
const actionRegistry = SLIME_MOBILE_WEARABLE_ACTION_REGISTRY as unknown as Record<
  string,
  Pick<RegistryEntry, "sheets" | "timelines">
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
) as Record<string, RegistryEntry>;

export function slimeWearableEntry(role: SlimeWearableRole, option: string): RegistryEntry | null {
  return registry[`${role}/${option}`] ?? null;
}

/**
 * Map a character action to the overlay timeline key. Wearables are authored
 * for the idle and drink timelines only; jump floors use incompatible canvases.
 */
/**
 * Map a character action to the overlay timeline key. Every action has a key,
 * including the jump floors, whose taller canvas is handled by the sheet's
 * `characterOffsetY` rather than by exclusion.
 */
export function slimeWearableTimelineKey(
  action: SlimeWearableAction,
  drinkFlavor?: string | null,
): string | null {
  if (action === "drink") return drinkFlavor ? `drink:${drinkFlavor}` : null;
  return action;
}

function normalizedFrameIndex(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  if (!Number.isFinite(frameIndex)) return 0;
  const normalized = Math.trunc(frameIndex) % frameCount;
  return normalized < 0 ? normalized + frameCount : normalized;
}

/** Actions for which any wearable anchors could exist. */
export function slimeActionSupportsWearables(action: SlimeSheetAction): boolean {
  return slimeWearableTimelineKey(action, "any") !== null;
}

/** Whether one option has an authored track for this action. */
export function slimeWearableCoversAction(
  role: SlimeWearableRole,
  option: string,
  action: SlimeWearableAction,
  drinkFlavor?: string | null,
): boolean {
  const timelineKey = slimeWearableTimelineKey(action, drinkFlavor);
  if (!timelineKey) return false;
  const timelines = slimeWearableEntry(role, option)?.timelines;
  return Boolean(timelines?.[timelineKey]);
}

/**
 * Resolve which head option is semantically worn. A player-selected hat always
 * outranks the growth crown, and removing it restores the crown.
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
 * An equipped hat with no track for this action is omitted rather than replaced
 * by the growth crown.
 */
export function resolveSlimeComposition(
  action: SlimeSheetAction,
  headSlot: SlimeHeadSlot,
  drinkFlavor?: string | null,
): SlimeCompositionDecision {
  if (!slimeActionSupportsWearables(action)) {
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

/** Resolve every equipped wearable layer for one rendered frame. */
export function resolveSlimeWearables(
  selection: SlimeWearableSelection,
  slimeColor: SlimeColor,
  action: SlimeWearableAction,
  frameIndex: number,
  drinkFlavor?: string | null,
): readonly ResolvedSlimeWearable[] {
  const timelineKey = slimeWearableTimelineKey(action, drinkFlavor);
  if (!timelineKey) return [];

  const resolved: ResolvedSlimeWearable[] = [];
  for (const role of SLIME_WEARABLE_ROLES) {
    const option = selection[role];
    if (!option) continue;
    const entry = slimeWearableEntry(role, option);
    if (!entry) continue;
    const timeline = entry.timelines[timelineKey];
    if (!timeline) continue;
    const sheet = entry.sheets[timeline.sheet];
    if (!sheet) continue;
    const anchors = timeline.anchorOverridesByColor?.[slimeColor] ?? timeline.anchors;
    const anchor = anchors[normalizedFrameIndex(frameIndex, anchors.length)];
    if (!anchor) continue;
    const image = entry.colorSensitive ? sheet.imageByColor?.[slimeColor] : sheet.image;
    if (!image) continue;
    resolved.push({
      key: entry.key,
      role: entry.role,
      option: entry.option,
      image,
      zIndex: entry.zIndex,
      sourceFrame: anchor.sourceFrame,
      dx: anchor.dx,
      dy: anchor.dy,
      sheetFrameCount: sheet.frameCount,
      frameSize: sheet.frameSize,
      characterOffsetY: sheet.characterOffsetY,
      grounded: sheet.grounded,
      imageScale: entry.imageScale,
    });
  }
  return resolved.sort((a, b) => a.zIndex - b.zIndex);
}
