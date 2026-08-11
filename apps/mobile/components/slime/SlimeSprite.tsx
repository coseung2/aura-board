import type { SlimeSpriteProps } from "./slime-types";
import { SlimeSpriteLayers } from "./SlimeSpriteLayers";
import { useSlimeSpriteModel } from "./use-slime-sprite-model";

export { FeatheredSceneBackground } from "./use-slime-sprite-model";
export type {
  EquippedFloor,
  SlimeAction,
  SlimeColor,
  SlimeEvolution,
} from "../../lib/slime-assets";

export function SlimeSprite(props: SlimeSpriteProps) {
  return <SlimeSpriteLayers model={useSlimeSpriteModel(props)} />;
}
