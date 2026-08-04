"use client";

import type { SlimeAction, SlimeColor, EquippedFloor } from "@/lib/pets/slime-assets";
import { resolveSlimeCharacterPresentation } from "@/lib/pets/slime-character-presentation";
import type { SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import { OfficialSlimeSprite } from "./OfficialSlimeSprite";
import styles from "./SlimeCharacterSprite.module.css";

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
  /** Integer renderer scale for the logical 64px viewport. */
  scale?: number;
  /**
   * Scene backgrounds full-bleed into the host frame by default so every
   * surface (내 펫, 홈, 우리반 펫) shares one canvas contract. Pass false only
   * for rare nested previews that must keep the background inside the 96px
   * sprite bounds.
   */
  hostBackground?: boolean;
  className?: string;
};

export function SlimeCharacterSprite({
  slime,
  items = [],
  growthStage = 1,
  action,
  equippedFloor,
  onComplete,
  repeat = false,
  scale,
  hostBackground,
  className = "",
}: Props) {
  const {
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
    repeat: resolvedRepeat,
  } = resolveSlimeCharacterPresentation({
    slime,
    items,
    action,
    equippedFloor,
    hostBackground,
    repeat,
  });

  return (
    <div
      className={`${styles.frame} ${hasScene ? styles.sceneFrame : ""} ${useHostBackground ? styles.hostSceneFrame : ""} ${className}`.trim()}
    >
      {useHostBackground && sceneBackgroundPath ? (
        <div className={styles.hostBackgroundFeather} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sceneBackgroundPath}
            alt=""
            className={styles.hostBackgroundImage}
            draggable={false}
          />
        </div>
      ) : null}
      <OfficialSlimeSprite
        slimeColor={slime.color as SlimeColor}
        growthStage={growthStage}
        action={resolvedAction}
        equippedFloor={floor}
        itemSpritePath={itemSpritePath}
        propAction={propAction}
        backgroundSpritePath={
          renderBackgroundInSprite ? sceneBackgroundPath ?? undefined : undefined
        }
        expandSceneSurfaces={Boolean(backgroundItem || propAction || useHostBackground)}
        vehicleSpritePath={
          renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath
        }
        vehicleGroundedSpritePath={renderedVehicle?.vehicleGroundedSpritePath}
        vehicleEffectSpritePaths={renderedVehicle?.vehicleEffectSpritePaths}
        vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
        vehicleGroundedFrameCount={renderedVehicle?.vehicleGroundedFrameCount}
        vehicleGroundedFrameDurationMs={
          renderedVehicle?.vehicleGroundedFrameDurationMs
        }
        vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
        vehicleCharacterOffsetY={renderedVehicle?.vehicleCharacterOffsetY}
        vehicleBobY={renderedVehicle?.vehicleBobY}
        vehicleRiseY={renderedVehicle?.vehicleRiseY}
        vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
        wearables={wearables}
        drinkFlavor={
          propAction?.kind === "drink" ? propAction.flavor : drinkFlavor
        }
        repeat={resolvedRepeat}
        scale={scale}
        alt={alt}
        dataSlimeColor={slime.color as SlimeColor}
        onComplete={onComplete}
      />
    </div>
  );
}
