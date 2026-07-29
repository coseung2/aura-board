"use client";

import type { SlimeAction, SlimeColor, EquippedFloor } from "@/lib/pets/slime-assets";
import { isSlimeSceneBackground } from "@/lib/pets/catalog";
import type { SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import styles from "./SlimeCharacterSprite.module.css";
import { slimeItemSpritePath, slimeWearablesFromItems } from "./SlimePetModel";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

export type SlimeGrowthStage = 1 | 2 | 3;

type Props = {
  slime: SlimeDefinition;
  items?: SlimeShopItem[];
  /** Persisted server stage; callers may use stage one while loading. */
  growthStage?: SlimeGrowthStage;
  /** A transient action controlled by the owning card. */
  action?: SlimeAction;
  /** Optional server-restored semantic floor. Legacy callers can omit it. */
  equippedFloor?: EquippedFloor;
  onComplete?: () => void;
  repeat?: boolean;
  className?: string;
};

function floorFromItems(items: readonly SlimeShopItem[]): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const item of items) {
    const candidate = item.floor;
    if (candidate) floor = candidate;
  }
  return floor;
}

export function SlimeCharacterSprite({
  slime,
  items = [],
  growthStage = 1,
  action,
  equippedFloor,
  onComplete,
  repeat = false,
  className = "",
}: Props) {
  const assignedFloor = equippedFloor ?? floorFromItems(items);
  const wearables = slimeWearablesFromItems(items);
  const drinkFlavor = wearables.drink ?? null;
  const vehicleItem = items.reduce<SlimeShopItem | null>(
    (vehicle, item) =>
      item.category === "vehicle" || item.category === "ride" ? item : vehicle,
    null,
  );
  const usesTrampoline = vehicleItem?.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const renderedVehicle = usesTrampoline ? null : vehicleItem;
  const floor: EquippedFloor = usesTrampoline ? "trampoline" : assignedFloor;
  // An equipped drink has no idle timeline, so callers that do not manage an
  // action would otherwise render a slime holding nothing.
  const resolvedAction: SlimeAction =
    action ?? (usesTrampoline ? "floor-interaction" : drinkFlavor ? "drink" : "idle");
  const backgroundItem = items.reduce<SlimeShopItem | null>(
    (background, item) => isSlimeSceneBackground(item) ? item : background,
    null,
  );
  // Only unsupported legacy props may fall back to a complete character GIF.
  // Drinks and floors have canonical color/evolution-specific official sheets.
  // Ball props are complete, color-specific looping GIFs rather than an
  // overlay sheet. Resolve them from the equipped slime color before falling
  // back to legacy prop paths.
  const ballItem = items.find((item) => item.key.startsWith("slime-ball-"));
  const itemSpritePath = ballItem
    ? slimeItemSpritePath(ballItem, slime.color as SlimeColor)
    : items.find(
        (item) =>
          !item.floor &&
          item.category !== "background" &&
          item.category !== "drink" &&
          item.category !== "wearable" &&
          item.category !== "vehicle" &&
          item.category !== "ride",
      )?.spritePath;
  const hasScene = Boolean(backgroundItem || vehicleItem || floor !== "none");
  const itemLabels = items.map((item) => item.labelKo).join(", ");
  const alt = items.length > 0
    ? `${slime.nameKo}, ${itemLabels} 적용 미리보기`
    : `${slime.nameKo} 미리보기`;

  return (
    <div
      className={`${styles.frame} ${hasScene ? styles.sceneFrame : ""} ${className}`.trim()}
    >
      <OfficialSlimeSprite
        slimeColor={slime.color as SlimeColor}
        growthStage={growthStage}
        action={resolvedAction}
        equippedFloor={floor}
        itemSpritePath={itemSpritePath}
        expandSceneSurfaces={Boolean(backgroundItem)}
        vehicleSpritePath={renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath}
        vehicleGroundedSpritePath={renderedVehicle?.vehicleGroundedSpritePath}
        vehicleEffectSpritePaths={renderedVehicle?.vehicleEffectSpritePaths}
        vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
        vehicleGroundedFrameCount={renderedVehicle?.vehicleGroundedFrameCount}
        vehicleGroundedFrameDurationMs={renderedVehicle?.vehicleGroundedFrameDurationMs}
        vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
        vehicleCharacterOffsetY={renderedVehicle?.vehicleCharacterOffsetY}
        vehicleBobY={renderedVehicle?.vehicleBobY}
        vehicleRiseY={renderedVehicle?.vehicleRiseY}
        vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
        wearables={wearables}
        drinkFlavor={drinkFlavor}
        repeat={repeat || Boolean(ballItem) || Boolean(drinkFlavor)}
        alt={alt}
        dataSlimeColor={slime.color as SlimeColor}
        onComplete={onComplete}
      />
    </div>
  );
}
