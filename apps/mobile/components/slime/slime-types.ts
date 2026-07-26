import type {
  EquippedFloor,
  SlimeAction,
  SlimeColor,
  SlimeEvolution,
} from "../../lib/slime-assets";

export type SlimeSpriteProps = {
  slimeColor: SlimeColor;
  evolution?: SlimeEvolution;
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
  onComplete?: () => void;
};

/** Scene backgrounds are feathered by this proportion on every edge. */
export const SCENE_BACKGROUND_FEATHER_RATIO = 1 / 16;

export function sceneBackgroundFeatherInset(size: number): number {
  return Number.isFinite(size) && size > 0 ? size * SCENE_BACKGROUND_FEATHER_RATIO : 0;
}
