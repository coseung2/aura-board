import { useMemo } from "react";
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { getApiBase } from "../../lib/api";
import { containPetScene, type GameParticipantPetData, type GameParticipantPetSize, type PetSceneRect } from "../../lib/game-participant-pet";
import { projectGameParticipantPet } from "../../lib/game-participant-pet-projection";
import { SLIME_ASSET_COLORS, type SlimeColor } from "../../lib/slime-assets";
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import { resolveSlimeWearables } from "../../lib/slime-wearables";
import { resolveSlimeRemoteSpriteUri } from "../../lib/slime-catalog";
import { colors, typography } from "../../theme/tokens";
import { SlimeSpriteLayers } from "../slime/SlimeSpriteLayers";
import { useSlimeSpriteModel } from "../slime/use-slime-sprite-model";

type Props = { name: string; pet?: GameParticipantPetData | null; size?: GameParticipantPetSize };

export function GameParticipantPet({ name, pet, size = 44 }: Props) {
  const holder = { width: size, height: size };
  return (
    <View style={[styles.holder, holder]} pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={`${name} 대표 펫`}>
      {pet ? <ParticipantScene pet={pet} size={size} /> : <Text style={styles.fallback}>{name.slice(0, 1)}</Text>}
    </View>
  );
}

function ParticipantScene({ pet, size }: { pet: GameParticipantPetData; size: GameParticipantPetSize }) {
  const projection = useMemo(() => projectGameParticipantPet(pet), [pet]);
  const { vehicle, wearables, food } = projection;
  const trampoline = vehicle?.key === "slime-blue-trampoline";
  const renderedVehicle = trampoline ? null : vehicle;
  const slimeColor = (SLIME_ASSET_COLORS as readonly string[]).includes(pet.color) ? pet.color as SlimeColor : SLIME_ASSET_COLORS[0];
  const propAction = useMemo(() => resolveEquippedSlimePropAction(projection.keys, projection.items), [projection]);
  const model = useSlimeSpriteModel({
    slimeColor,
    growthStage: pet.growthStage,
    displayScale: 1,
    action: trampoline ? "floor-interaction" : "idle",
    // The trampoline is a vehicle whose existing renderer uses this action slot.
    equippedFloor: trampoline ? "trampoline" : "none",
    repeat: true,
    propAction,
    wearables,
    drinkFlavor: wearables.drink,
    vehicleSpritePath: renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath,
    vehicleGroundedSpritePath: renderedVehicle?.vehicleGroundedSpritePath,
    vehicleEffectSpritePaths: renderedVehicle?.vehicleEffectSpritePaths,
    vehicleFrameCount: renderedVehicle?.vehicleFrameCount,
    vehicleGroundedFrameCount: renderedVehicle?.vehicleGroundedFrameCount,
    vehicleGroundedFrameDurationMs: renderedVehicle?.vehicleGroundedFrameDurationMs,
    vehicleCanvasHeight: renderedVehicle?.vehicleCanvasHeight,
    vehicleCharacterOffsetY: renderedVehicle?.vehicleCharacterOffsetY,
    vehicleBobY: renderedVehicle?.vehicleBobY,
    vehicleRiseY: renderedVehicle?.vehicleRiseY,
    vehicleOffsetX: renderedVehicle?.vehicleOffsetX,
  });
  const bounds = useMemo(() => {
    const { resolution, sceneInsetX, sceneInsetY, sceneWidth, sceneHeight, baseViewport } = model;
    const unit = resolution.imageScale * model.displayScale;
    const bob = renderedVehicle?.vehicleBobY ?? [0];
    const rise = Math.max(0, Math.trunc(renderedVehicle?.vehicleRiseY ?? 0));
    const offsets = [Math.min(0, ...bob) - rise, Math.max(0, ...bob) - rise].map((value) => value * unit);
    const rects: PetSceneRect[] = [{ left: 0, top: 0, width: sceneWidth, height: sceneHeight }];
    if (renderedVehicle) rects.push(model.vehicleViewportStyle);
    const action = propAction?.kind === "ball" ? "ball-hit" : propAction?.kind === "drink" ? "drink" : trampoline ? "trampoline" : "idle";
    const count = model.ballAsset?.frameCount ?? resolution.frameCount;
    for (let frame = 0; frame < count; frame++) {
      const layers = resolveSlimeWearables({ ...wearables, headwear: resolution.renderedHeadwear }, slimeColor, action, frame, resolution.drinkFlavor);
      for (const offset of offsets) {
        rects.push({ left: sceneInsetX, top: sceneInsetY + offset, ...baseViewport });
        if (model.ballAsset) rects.push({ left: 0, top: offset, width: sceneWidth, height: sceneHeight });
        for (const layer of layers) {
          const scale = layer.imageScale * model.displayScale;
          rects.push({ left: sceneInsetX + layer.dx * scale, top: sceneInsetY + (layer.dy - layer.characterOffsetY) * scale + offset, width: layer.frameSize.w * scale, height: layer.frameSize.h * scale });
        }
      }
    }
    return containPetScene(rects, size);
  }, [model.resolution, model.sceneWidth, model.sceneHeight, model.displayScale, model.ballAsset, model.equipmentWearables[0]?.image, renderedVehicle, wearables, slimeColor, propAction, trampoline, size]);
  const canvas = { width: bounds.width, height: bounds.height, left: (size - bounds.width) / 2, top: (size - bounds.height) / 2, transform: [{ scale: bounds.scale }] };
  const origin = { left: -bounds.left, top: -bounds.top };
  const foodStyle = { width: model.baseViewport.width / 3, height: model.baseViewport.height / 3, left: model.sceneWidth - model.baseViewport.width / 3, top: model.sceneHeight - model.baseViewport.height / 3 };
  return (
    <View style={[styles.canvas, canvas]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.canvas, origin]}>
        <SlimeSpriteLayers model={model} containScene />
        {food ? <Image source={{ uri: resolveSlimeRemoteSpriteUri(food.spritePath, getApiBase()) }} style={[styles.canvas, foodStyle]} contentFit="contain" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  holder: { position: "relative", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  canvas: { position: "absolute" },
  fallback: { ...typography.label, color: colors.textMuted },
});
