import {
  isSlimeSceneBackground,
  selectSceneBackgroundSpritePath,
} from "./catalog";
import { resolveEquippedSlimePropAction, type SlimePropAction } from "./slime-props";
import type { EquippedFloor, SlimeAction } from "./slime-assets";
import type { SlimeDefinition, SlimeShopItem } from "./types";
import { normalizeEquippedWearables } from "./wearable-catalog";
import type { SlimeWearableSelection } from "./slime-wearables";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

export type SlimeCharacterPresentation = {
  wearables: SlimeWearableSelection;
  drinkFlavor: string | null;
  renderedVehicle: SlimeShopItem | null;
  floor: EquippedFloor;
  propAction: SlimePropAction | null;
  resolvedAction: SlimeAction;
  backgroundItem: SlimeShopItem | null;
  itemSpritePath?: string;
  hasScene: boolean;
  alt: string;
  sceneBackgroundPath: string | null;
  useHostBackground: boolean;
  renderBackgroundInSprite: boolean;
  repeat: boolean;
};

type ResolveSlimeCharacterPresentationInput = {
  slime: SlimeDefinition;
  items: readonly SlimeShopItem[];
  action?: SlimeAction;
  equippedFloor?: EquippedFloor;
  hostBackground?: boolean;
  repeat?: boolean;
};

function floorFromItems(items: readonly SlimeShopItem[]): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const item of items) {
    if (item.floor) floor = item.floor;
  }
  return floor;
}

function wearablesFromItems(
  items: readonly SlimeShopItem[],
): SlimeWearableSelection {
  const selection = normalizeEquippedWearables(items.map((item) => item.key));
  const drink = items.find((item) => item.category === "drink");
  return {
    blush: selection.blush ?? null,
    eyewear: selection.eyewear ?? null,
    headwear: selection.headwear ?? null,
    drink: drink?.animationKey ?? null,
  };
}

/** Pure item-to-layer contract shared by character card renderers and tests. */
export function resolveSlimeCharacterPresentation({
  slime,
  items,
  action,
  equippedFloor: _unusedEquippedFloor,
  hostBackground,
  repeat = false,
}: ResolveSlimeCharacterPresentationInput): SlimeCharacterPresentation {
  void _unusedEquippedFloor;
  const assignedFloor = floorFromItems(items);
  const wearables = wearablesFromItems(items);
  const drinkFlavor = wearables.drink ?? null;
  const vehicleItem = items.reduce<SlimeShopItem | null>(
    (vehicle, item) =>
      item.category === "vehicle" || item.category === "ride" ? item : vehicle,
    null,
  );
  const usesTrampoline = vehicleItem?.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const renderedVehicle = usesTrampoline ? null : vehicleItem;
  const floor: EquippedFloor = usesTrampoline ? "trampoline" : assignedFloor;
  const propAction = resolveEquippedSlimePropAction(
    items.map((item) => item.key),
    items,
  );
  const resolvedAction: SlimeAction =
    action ??
    (usesTrampoline
      ? "floor-interaction"
      : propAction?.kind === "drink" || drinkFlavor
        ? "drink"
        : "idle");
  const backgroundItem = items.reduce<SlimeShopItem | null>(
    (background, item) => (isSlimeSceneBackground(item) ? item : background),
    null,
  );
  const itemSpritePath = propAction
    ? undefined
    : items.find(
        (item) =>
          !item.floor &&
          item.category !== "background" &&
          item.category !== "drink" &&
          item.category !== "wearable" &&
          item.category !== "vehicle" &&
          item.category !== "ride" &&
          !item.key.startsWith("slime-ball-"),
      )?.spritePath;
  const hasScene = Boolean(
    backgroundItem || vehicleItem || floor !== "none" || propAction,
  );
  const itemLabels = items.map((item) => item.labelKo).join(", ");
  const alt =
    items.length > 0
      ? `${slime.nameKo}, ${itemLabels} 적용 미리보기`
      : `${slime.nameKo} 미리보기`;
  const sceneBackgroundPath = backgroundItem
    ? selectSceneBackgroundSpritePath(backgroundItem)
    : null;
  const useHostBackground = hostBackground ?? Boolean(sceneBackgroundPath);
  const renderBackgroundInSprite =
    !useHostBackground && Boolean(sceneBackgroundPath);

  return {
    wearables,
    drinkFlavor,
    renderedVehicle,
    floor,
    propAction,
    resolvedAction,
    backgroundItem,
    itemSpritePath,
    hasScene,
    alt,
    sceneBackgroundPath,
    useHostBackground,
    renderBackgroundInSprite,
    repeat:
      repeat ||
      propAction?.kind === "ball" ||
      propAction?.kind === "drink" ||
      Boolean(drinkFlavor),
  };
}
