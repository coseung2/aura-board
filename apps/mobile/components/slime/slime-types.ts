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
  onComplete?: () => void;
};
