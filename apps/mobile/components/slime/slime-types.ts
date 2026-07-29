import type {
  EquippedFloor,
  SlimeAction,
  SlimeColor,
  SlimeEvolution,
} from "../../lib/slime-assets";
import type { SlimeWearableSelection } from "../../lib/slime-wearables";

export type SlimeSpriteProps = {
  slimeColor: SlimeColor;
  /**
   * Persisted evolution. Prefer `growthStage`; this remains for callers that
   * only carry the evolution, and the resolver derives a stage from it.
   */
  evolution?: SlimeEvolution;
  /** Growth stage owning the default crown, which a chosen hat outranks. */
  growthStage?: number;
  action?: SlimeAction;
  equippedFloor?: EquippedFloor;
  /** Additional integer multiplier for the already nearest-scaled 4x art. */
  displayScale?: number;
  accessibilityLabel?: string;
  /** Force a normally one-shot equipped animation to loop in the pet preview. */
  repeat?: boolean;
  /** Complete color-specific animated prop, such as an equipped ball GIF. */
  itemSpritePath?: string;
  /** Remote/API-relative scene background rendered behind floor and slime layers. */
  backgroundSpritePath?: string;
  /**
   * Vehicle art the slime rides. Vehicles sit above the floor instead of
   * replacing it, so a tube on grass stays valid and a player who wants water
   * buys that background separately.
   *
   * Drawn above the character as a single layer; the hidden side is never
   * authored.
   */
  vehicleSpritePath?: string;
  /**
   * Vehicle parts that stay planted while the body moves, such as wheels.
   */
  vehicleGroundedSpritePath?: string;
  /** Frames in the vehicle body sheet. One means a single static image. */
  vehicleFrameCount?: number;
  /** Frames in the grounded-part sheet, such as a wheel rotation. */
  vehicleGroundedFrameCount?: number;
  /**
   * Fixed frame duration for the grounded part, in milliseconds. A rotation runs
   * at a constant rate while the body follows the slime's variable idle timing.
   */
  vehicleGroundedFrameDurationMs?: number;
  /** Height of the vehicle canvas; taller than the viewport when art needs headroom. */
  vehicleCanvasHeight?: number;
  /** Where the character sits inside a taller vehicle canvas. */
  vehicleCharacterOffsetY?: number;
  /** Per-frame vertical bob authored into the vehicle. The rider follows it. */
  vehicleBobY?: readonly number[];
  /**
   * Pixels the vehicle lifts the slime, in 64px-viewport units. Fixed on purpose:
   * a per-frame offset would double the slime's own idle amplitude.
   */
  vehicleRiseY?: number;
  /**
   * Anchor-composed wearable layers. Each equipped option is one shared sheet
   * repositioned per frame, so new drinks never require rebaking wearables.
   */
  wearables?: SlimeWearableSelection;
  /** Drink flavor selecting the wearable drink timeline, such as `lemonade`. */
  drinkFlavor?: string | null;
  onComplete?: () => void;
};

/**
 * Proportion of each axis the scene background feather spans.
 *
 * Widened from 1/16 so the fade reads as a gradual falloff rather than a thin
 * band: at 1/16 only about 8 of 128 pixels were affected and the boundary was
 * visible. The mask asset is regenerated from this value, so the two must change
 * together.
 */
export const SCENE_BACKGROUND_FEATHER_RATIO = 3 / 16;

export function sceneBackgroundFeatherInset(size: number): number {
  return Number.isFinite(size) && size > 0 ? size * SCENE_BACKGROUND_FEATHER_RATIO : 0;
}

/**
 * Alpha the feather mask carries at a normalized position.
 *
 * The renderer applies this as one prebaked mask image rather than four nested
 * masks, so this function documents the contract that
 * `scripts/generate-feather-mask.mjs` bakes and that the mask test asserts.
 *
 * Two properties are deliberate. The ramp is smoothstepped rather than linear, so
 * the fade eases in at the outer edge and eases out where it meets opaque art
 * instead of ending on a visible crease. And alpha is the product of the two axes,
 * never their minimum: a minimum would hold corners at the single-axis value and
 * square off the corner fade.
 */
export function sceneBackgroundFeatherAlpha(
  normalizedX: number,
  normalizedY: number,
): number {
  const ramp = (position: number) => {
    const rising = Math.min(position / SCENE_BACKGROUND_FEATHER_RATIO, 1);
    const falling = Math.min((1 - position) / SCENE_BACKGROUND_FEATHER_RATIO, 1);
    const linear = Math.max(0, Math.min(rising, falling));
    return linear * linear * (3 - 2 * linear);
  };
  return ramp(normalizedX) * ramp(normalizedY);
}
