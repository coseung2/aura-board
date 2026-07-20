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
  onComplete?: () => void;
};
