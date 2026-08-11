import type { ResolvedSlimeWearable } from "../../lib/slime-wearables";
import { Image } from "expo-image";
import { View } from "react-native";
import { getApiBase } from "../../lib/api";
import { layers } from "../../theme/tokens";
import { resolveSlimeRemoteSpriteUri } from "../../lib/slimes";
import { slimeUi } from "../../theme/tokens";
import { styles } from "./slime-sprite.styles";
import type { SlimeSpriteViewModel } from "./use-slime-sprite-model";

export function SlimeSpriteLayers({ model }: { model: SlimeSpriteViewModel }) {
  const {
    styles,
    viewport,
    resolution,
    sceneWidth,
    sceneHeight,
    puddleAsset,
    puddleFrame,
    puddlePackedSheetSize,
    puddleOffset,
    sourceSize,
    displayScale,
    sceneInsetX,
    sceneInsetY,
    imageSource,
    playbackKey,
    staticFloor,
    floorWidth,
    floorHeight,
    floorInsetX,
    expandedFloorTop,
    vehicleGroundedUri,
    vehicleViewportStyle,
    vehicleGroundedFrames,
    groundedFrame,
    ballAsset,
    ballPackedSheetSize,
    ballOffset,
    riderOffsetY,
    baseViewport,
    packedSheetSize,
    baseOffset,
    equipmentWearables,
    vehicleUri,
    vehicleFrames,
    frameIndex,
    vehicleEffectUris,
    propWearables,
    FeatheredSceneBackground,
    vehicleCanvas,
    itemLayer,
    backgroundSpritePath,
    accessibilityLabel,
    slimeColor,
    equippedFloor,
    TRAMPOLINE_FLOOR_SOURCE,
  } = model;
  const renderBackgroundLayer = (sizeStyle: {
    width: number;
    height: number;
  }) =>
    backgroundSpritePath ? (
      <FeatheredSceneBackground
        spritePath={backgroundSpritePath}
        style={sizeStyle}
      />
    ) : null;

  const vehicleSheetStyle = (sheetFrames: number, activeFrame: number) => ({
    width:
      slimeUi.vehicleFrameWidth *
      sheetFrames *
      resolution.imageScale *
      displayScale,
    height: vehicleCanvas * resolution.imageScale * displayScale,
    left:
      -(activeFrame % sheetFrames) *
      slimeUi.vehicleFrameWidth *
      resolution.imageScale *
      displayScale,
    top: 0,
  });

  const renderWearableLayers = (
    items: readonly ResolvedSlimeWearable[],
    frontmost = false,
  ) =>
    items.map((wearable) => (
      <View
        key={wearable.key}
        style={[
          styles.layer,
          styles.frameViewport,
          {
            width: wearable.frameSize.w * wearable.imageScale * displayScale,
            height: wearable.frameSize.h * wearable.imageScale * displayScale,
            left:
              sceneInsetX + wearable.dx * wearable.imageScale * displayScale,
            top:
              sceneInsetY +
              (wearable.dy - wearable.characterOffsetY) *
                wearable.imageScale *
                displayScale +
              riderOffsetY,
            zIndex: layers.spriteItem + wearable.zIndex,
          },
          frontmost && styles.propLayer,
        ]}
        pointerEvents="none"
        testID={frontmost ? "slime-prop-overlay" : undefined}
      >
        <Image
          source={
            wearable.image.kind === "remote"
              ? {
                  uri: resolveSlimeRemoteSpriteUri(
                    wearable.image.path,
                    getApiBase(),
                  ),
                }
              : imageSource(wearable.image.source)
          }
          style={[
            styles.layer,
            {
              width:
                wearable.frameSize.w *
                wearable.sheetFrameCount *
                wearable.imageScale *
                displayScale,
              height: wearable.frameSize.h * wearable.imageScale * displayScale,
              left:
                -wearable.sourceFrame *
                wearable.frameSize.w *
                wearable.imageScale *
                displayScale,
              top: 0,
            },
          ]}
          contentFit="fill"
          allowDownscaling={false}
          recyclingKey={`${playbackKey}:${wearable.key}:${wearable.image.kind === "remote" ? wearable.image.path : "local"}`}
          transition={0}
          accessible={false}
        />
      </View>
    ));
  if (itemLayer) {
    const {
      uri,
      size,
      itemSizeStyle,
      itemInsetX,
      itemInsetY,
      itemViewportStyle,
      insetItemStyle,
    } = itemLayer;
    return (
      <View
        style={[styles.viewport, itemViewportStyle]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          accessibilityLabel ?? `${slimeColor} 슬라임 장착 소품 모습`
        }
        testID="slime-sprite"
      >
        {renderBackgroundLayer({ width: sceneWidth, height: sceneHeight })}
        {puddleAsset && puddleFrame && puddlePackedSheetSize && puddleOffset ? (
          <View
            style={[
              styles.layer,
              styles.floorUnder,
              styles.frameViewport,
              {
                width:
                  puddleFrame.sourceSize.w *
                  puddleAsset.imageScale *
                  displayScale,
                height:
                  puddleFrame.sourceSize.h *
                  puddleAsset.imageScale *
                  displayScale,
                left: itemInsetX,
                top: itemInsetY,
              },
            ]}
            pointerEvents="none"
          >
            <Image
              source={imageSource(puddleAsset.image)}
              style={[styles.layer, puddlePackedSheetSize, puddleOffset]}
              contentFit="fill"
              allowDownscaling={false}
              recyclingKey={`${playbackKey}:puddle-under-item`}
              transition={0}
              accessible={false}
            />
          </View>
        ) : null}
        {staticFloor ? (
          <Image
            source={imageSource(staticFloor.image)}
            style={[
              styles.layer,
              styles.floorUnder,
              {
                width: floorWidth,
                height: floorHeight,
                left: floorInsetX,
                top: expandedFloorTop,
              },
            ]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:floor-under-item`}
            transition={0}
            accessible={false}
          />
        ) : null}
        {equippedFloor === "trampoline" ? (
          <Image
            source={imageSource(TRAMPOLINE_FLOOR_SOURCE)}
            style={[
              styles.layer,
              styles.floorUnder,
              {
                width: floorWidth,
                height: floorHeight,
                left: floorInsetX,
                top: itemInsetY + size - floorHeight,
              },
            ]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:trampoline-under-item`}
            transition={0}
            accessible={false}
          />
        ) : null}
        <Image
          source={{ uri }}
          style={[styles.layer, styles.itemLayer, insetItemStyle]}
          contentFit="contain"
          recyclingKey={`item:${uri}`}
          transition={0}
          accessible={false}
        />
      </View>
    );
  }
  return (
    <View
      style={[styles.viewport, viewport]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ?? `${slimeColor} 슬라임 ${resolution.action} 모습`
      }
      testID="slime-sprite"
    >
      {renderBackgroundLayer({ width: sceneWidth, height: sceneHeight })}
      {puddleAsset && puddleFrame && puddlePackedSheetSize && puddleOffset ? (
        <View
          style={[
            styles.layer,
            styles.floorUnder,
            styles.frameViewport,
            {
              width:
                puddleFrame.sourceSize.w *
                puddleAsset.imageScale *
                displayScale,
              height:
                puddleFrame.sourceSize.h *
                puddleAsset.imageScale *
                displayScale,
              left: sceneInsetX,
              top: sceneInsetY,
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={imageSource(puddleAsset.image)}
            style={[styles.layer, puddlePackedSheetSize, puddleOffset]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:puddle`}
            transition={0}
            accessible={false}
          />
        </View>
      ) : null}
      {staticFloor ? (
        <Image
          source={imageSource(staticFloor.image)}
          style={[
            styles.layer,
            styles.floorUnder,
            {
              width: floorWidth,
              height: floorHeight,
              left: floorInsetX,
              top: expandedFloorTop,
            },
          ]}
          contentFit="fill"
          allowDownscaling={false}
          recyclingKey={`${playbackKey}:floor`}
          transition={0}
          accessible={false}
        />
      ) : null}
      {vehicleGroundedUri ? (
        // Parts that must stay planted while the body moves, such as wheels.
        <View
          style={[
            styles.layer,
            styles.floorUnder,
            styles.frameViewport,
            vehicleViewportStyle,
          ]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: vehicleGroundedUri }}
            style={[
              styles.layer,
              vehicleSheetStyle(vehicleGroundedFrames, groundedFrame),
            ]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:vehicle-grounded`}
            transition={0}
            accessible={false}
          />
        </View>
      ) : null}
      {ballAsset && ballPackedSheetSize && ballOffset ? (
        <View
          style={[
            styles.layer,
            styles.frameViewport,
            {
              width: sceneWidth,
              height: sceneHeight,
              left: 0,
              top: riderOffsetY,
            },
          ]}
          pointerEvents="none"
          testID="slime-ball-action-layer"
        >
          <Image
            source={imageSource(ballAsset.actionSheet)}
            style={[styles.layer, ballPackedSheetSize, ballOffset]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:ball-action`}
            transition={0}
            accessible={false}
          />
        </View>
      ) : (
        <View
          style={[
            styles.layer,
            styles.frameViewport,
            {
              width: baseViewport.width,
              height: baseViewport.height,
              left: sceneInsetX,
              top: sceneInsetY,
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={imageSource(resolution.sheet)}
            style={[styles.layer, packedSheetSize, baseOffset]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={playbackKey}
            transition={0}
            accessible={false}
          />
        </View>
      )}
      {renderWearableLayers(equipmentWearables)}
      {vehicleUri ? (
        // The vehicle itself, above every character layer. Drawing it in front is
        // what seats the slime inside without authoring the hidden side.
        <View
          style={[
            styles.layer,
            styles.frameViewport,
            vehicleViewportStyle,
            { zIndex: layers.spriteItem + 200 },
          ]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: vehicleUri }}
            style={[styles.layer, vehicleSheetStyle(vehicleFrames, frameIndex)]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:vehicle`}
            transition={0}
            accessible={false}
          />
        </View>
      ) : null}
      {vehicleEffectUris.map((uri, index) => (
        <View
          key={uri}
          style={[
            styles.layer,
            styles.frameViewport,
            vehicleViewportStyle,
            { zIndex: layers.spriteItem + 300 + index },
          ]}
          pointerEvents="none"
        >
          <Image
            source={{ uri }}
            style={[styles.layer, vehicleSheetStyle(vehicleFrames, frameIndex)]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:vehicle-fx:${uri}`}
            transition={0}
            accessible={false}
          />
        </View>
      ))}
      {resolution.happyHeart ? (
        <View
          style={[
            styles.layer,
            styles.frameViewport,
            {
              width: baseViewport.width,
              height: baseViewport.height,
              left: sceneInsetX,
              top: sceneInsetY,
            },
            { zIndex: layers.spriteItem + 400 },
          ]}
          pointerEvents="none"
          testID="slime-happy-heart-layer"
        >
          <Image
            source={imageSource(resolution.happyHeart.sheet)}
            style={[styles.layer, packedSheetSize, baseOffset]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:happy-heart-top`}
            transition={0}
            accessible={false}
          />
        </View>
      ) : null}
      {ballAsset && ballPackedSheetSize && ballOffset ? (
        <View
          style={[
            styles.layer,
            styles.frameViewport,
            {
              width: sceneWidth,
              height: sceneHeight,
              left: 0,
              top: riderOffsetY,
            },
            styles.propLayer,
          ]}
          pointerEvents="none"
          testID="slime-prop-overlay"
        >
          <Image
            source={imageSource(ballAsset.overlaySheet)}
            style={[styles.layer, ballPackedSheetSize, ballOffset]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:ball-prop`}
            transition={0}
            accessible={false}
          />
        </View>
      ) : null}
      {renderWearableLayers(propWearables, true)}
    </View>
  );
}
