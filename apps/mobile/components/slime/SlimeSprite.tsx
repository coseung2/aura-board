import { useEffect, useMemo, useRef, useState } from "react";
import { Image, type ImageProps } from "expo-image";
import MaskedView from "@react-native-masked-view/masked-view";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { layers } from "../../theme/tokens";
import { getApiBase } from "../../lib/api";
import {
  getSlimeFrame,
  resolveSlimeAsset,
  SLIME_SHARED_ASSETS,
  type SlimeAction,
  type SlimeColor,
  type SlimeEvolution,
  type EquippedFloor,
  type SlimeFrame,
} from "../../lib/slime-assets";
import { resolveSlimeRemoteSpriteUri } from "../../lib/slimes";
import {
  sceneBackgroundFeatherInset,
  type SlimeSpriteProps,
} from "./slime-types";

const DEFAULT_DISPLAY_SCALE = 1;
const TRAMPOLINE_FLOOR_SOURCE = require("../../assets/slimes/shared/trampoline-floor.png");
type LocalImageSource = ImageProps["source"];
type BackgroundEdge = "left" | "right" | "top" | "bottom";

function normalizedDisplayScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_DISPLAY_SCALE;
  return Math.max(0.25, Math.round((value as number) * 4) / 4);
}

function imageSource(value: unknown): LocalImageSource {
  // The generated registry contains only literal Metro `require` values.
  // Keeping this cast at the render boundary prevents a remote URI from ever
  // entering the sprite player.
  return value as LocalImageSource;
}

function sourceSize(frame: SlimeFrame, imageScale: number, scale: number) {
  return {
    width: frame.sourceSize.w * imageScale * scale,
    height: frame.sourceSize.h * imageScale * scale,
  };
}

function frameOffset(
  frame: SlimeFrame,
  imageScale: number,
  scale: number,
  offsetY: number,
) {
  return {
    left: (frame.spriteSourceSize.x - frame.frame.x) * imageScale * scale,
    top:
      (frame.spriteSourceSize.y - frame.frame.y) * imageScale * scale +
      offsetY,
  };
}

function BackgroundEdgeMask({
  edge,
  width,
  height,
}: {
  edge: BackgroundEdge;
  width: number;
  height: number;
}) {
  const horizontal = edge === "left" || edge === "right";
  const inset = sceneBackgroundFeatherInset(horizontal ? width : height);
  const gradientId = `scene-background-feather-${edge}`;
  const fromEdge = edge === "right" || edge === "bottom" ? 1 : 0;
  const toEdge = 1 - fromEdge;
  const edgeOffset = horizontal ? inset / width : inset / height;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient
          id={gradientId}
          x1={horizontal ? fromEdge : 0}
          y1={horizontal ? 0 : fromEdge}
          x2={horizontal ? toEdge : 0}
          y2={horizontal ? 0 : toEdge}
          gradientUnits="objectBoundingBox"
        >
          <Stop offset={0} stopColor="white" stopOpacity={0} />
          <Stop offset={edgeOffset} stopColor="white" stopOpacity={1} />
          <Stop offset={1} stopColor="white" stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${gradientId})`} />
    </Svg>
  );
}

function FeatheredBackground({
  backgroundUri,
  sizeStyle,
}: {
  backgroundUri: string;
  sizeStyle: { width: number; height: number };
}) {
  const width = Math.max(1, sizeStyle.width);
  const height = Math.max(1, sizeStyle.height);
  let content = (
    <Image
      source={{ uri: backgroundUri }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      recyclingKey={`background:${backgroundUri}`}
      transition={0}
      accessible={false}
    />
  );

  for (const edge of ["left", "right", "top", "bottom"] as const) {
    content = (
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={<BackgroundEdgeMask edge={edge} width={width} height={height} />}
      >
        {content}
      </MaskedView>
    );
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.layer, styles.backgroundLayer, sizeStyle]}
      accessible={false}
    >
      {content}
    </View>
  );
}

/**
 * Native player for the imported official slime sheets.
 *
 * The PNGs are generated nearest-scaled at 4x. We therefore render their
 * physical dimensions exactly and crop the packed sheet inside a viewport;
 * no dynamic require, URL, interpolation, or CSS animation is involved.
 */
export function SlimeSprite({
  slimeColor,
  evolution = "base",
  action = "idle",
  equippedFloor = "none",
  displayScale: requestedDisplayScale = DEFAULT_DISPLAY_SCALE,
  accessibilityLabel,
  repeat = false,
  itemSpritePath,
  backgroundSpritePath,
  onComplete,
}: SlimeSpriteProps) {
  const displayScale = normalizedDisplayScale(requestedDisplayScale);
  const resolution = useMemo(
    () => resolveSlimeAsset({ slimeColor, evolution, action, equippedFloor }),
    [action, equippedFloor, evolution, slimeColor],
  );
  const playbackKey = `${resolution.key}:${resolution.action}:${resolution.equippedFloor}`;
  const [frameIndex, setFrameIndex] = useState(0);
  const completedPlaybackRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const frame = getSlimeFrame(resolution, frameIndex);
  const staticFloor = resolution.staticFloor;
  const floorRise = staticFloor
    ? (staticFloor.slimeFootY - staticFloor.surfaceY) * resolution.imageScale * displayScale
    : 0;
  const viewport = {
    ...sourceSize(frame, resolution.imageScale, displayScale),
    height: frame.sourceSize.h * resolution.imageScale * displayScale + floorRise,
  };
  const packedSheetSize = {
    width: resolution.metadata.meta.size.w * resolution.imageScale * displayScale,
    height: resolution.metadata.meta.size.h * resolution.imageScale * displayScale,
  };
  const offset = frameOffset(frame, resolution.imageScale, displayScale, 0);
  const squareSourceSize = frame.sourceSize.w * resolution.imageScale * displayScale;

  useEffect(() => {
    setFrameIndex(0);
    completedPlaybackRef.current = null;
  }, [playbackKey]);

  useEffect(() => {
    const currentFrame = getSlimeFrame(resolution, frameIndex);
    const timeoutId = setTimeout(() => {
      const isLastFrame = frameIndex >= resolution.frameCount - 1;
      if (resolution.oneShot && isLastFrame && !repeat) {
        if (completedPlaybackRef.current !== playbackKey) {
          completedPlaybackRef.current = playbackKey;
          onCompleteRef.current?.();
        }
        return;
      }

      setFrameIndex((current) =>
        resolution.loop || repeat
          ? (current + 1) % resolution.frameCount
          : Math.min(current + 1, resolution.frameCount - 1),
      );
    }, Math.max(0, currentFrame.duration));

    return () => clearTimeout(timeoutId);
  }, [frameIndex, playbackKey, repeat, resolution]);

  const crownOverlay = resolution.crownOverlay;
  const puddleAsset = equippedFloor === "water-puddle"
    ? SLIME_SHARED_ASSETS.sharedPuddle
    : null;
  const puddleFrame = puddleAsset
    ? getSlimeFrame({ metadata: puddleAsset.metadata }, frameIndex)
    : null;
  const puddlePackedSheetSize = puddleAsset
    ? {
        width: puddleAsset.metadata.meta.size.w * puddleAsset.imageScale * displayScale,
        height: puddleAsset.metadata.meta.size.h * puddleAsset.imageScale * displayScale,
      }
    : null;
  const puddleOffset = puddleAsset && puddleFrame
    ? frameOffset(puddleFrame, puddleAsset.imageScale, displayScale, 0)
    : null;
  const backgroundUri = backgroundSpritePath
    ? resolveSlimeRemoteSpriteUri(backgroundSpritePath, getApiBase())
    : "";
  const renderBackgroundLayer = (sizeStyle: { width: number; height: number }) =>
    backgroundUri ? (
      <FeatheredBackground backgroundUri={backgroundUri} sizeStyle={sizeStyle} />
    ) : null;

  if (itemSpritePath) {
    const uri = resolveSlimeRemoteSpriteUri(itemSpritePath, getApiBase());
    const size = 256 * displayScale;
    const itemSizeStyle = { width: size, height: size };
    const itemViewportStyle = { width: size, height: size + floorRise };
    return (
      <View
        style={[styles.viewport, itemViewportStyle]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? `${slimeColor} 슬라임 장착 소품 모습`}
        testID="slime-sprite"
      >
        {renderBackgroundLayer(itemSizeStyle)}
        {puddleAsset && puddlePackedSheetSize && puddleOffset ? (
          <Image
            source={imageSource(puddleAsset.image)}
            style={[styles.layer, styles.floorUnder, puddlePackedSheetSize, puddleOffset]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:puddle-under-item`}
            transition={0}
            accessible={false}
          />
        ) : null}
        {staticFloor ? (
          <Image
            source={imageSource(staticFloor.image)}
            style={[styles.layer, styles.floorUnder, itemSizeStyle, { top: floorRise }]}
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
            style={[styles.layer, styles.floorUnder, itemSizeStyle]}
            contentFit="fill"
            allowDownscaling={false}
            recyclingKey={`${playbackKey}:trampoline-under-item`}
            transition={0}
            accessible={false}
          />
        ) : null}
        <Image
          source={{ uri }}
          style={[styles.layer, styles.itemLayer, itemSizeStyle]}
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
      {renderBackgroundLayer({ width: squareSourceSize, height: squareSourceSize })}
      {puddleAsset && puddlePackedSheetSize && puddleOffset ? (
        <Image
          source={imageSource(puddleAsset.image)}
          style={[styles.layer, styles.floorUnder, puddlePackedSheetSize, puddleOffset]}
          contentFit="fill"
          allowDownscaling={false}
          recyclingKey={`${playbackKey}:puddle`}
          transition={0}
          accessible={false}
        />
      ) : null}
      {staticFloor ? (
        <Image
          source={imageSource(staticFloor.image)}
          style={[
            styles.layer,
            styles.floorUnder,
            {
              width: frame.sourceSize.w * staticFloor.imageScale * displayScale,
              height: squareSourceSize,
              left: 0,
              top: floorRise,
            },
          ]}
          contentFit="fill"
          allowDownscaling={false}
          recyclingKey={`${playbackKey}:floor`}
          transition={0}
          accessible={false}
        />
      ) : null}
      <Image
        source={imageSource(resolution.sheet)}
        style={[styles.layer, packedSheetSize, offset]}
        contentFit="fill"
        allowDownscaling={false}
        recyclingKey={playbackKey}
        transition={0}
        accessible={false}
      />
      {crownOverlay ? (
        <Image
          source={imageSource(crownOverlay.overlay)}
          style={[
            styles.layer,
            {
              width: frame.sourceSize.w * crownOverlay.imageScale * displayScale,
              height: frame.sourceSize.w * crownOverlay.imageScale * displayScale,
            },
            { left: 0, top: 0 },
          ]}
          contentFit="fill"
          allowDownscaling={false}
          recyclingKey={`${playbackKey}:crown`}
          transition={0}
          accessible={false}
        />
      ) : null}
    </View>
  );
}

export type { EquippedFloor, SlimeAction, SlimeColor, SlimeEvolution };

const styles = StyleSheet.create({
  viewport: {
    position: "relative",
    overflow: "hidden",
  },
  layer: {
    position: "absolute",
  },
  // Keep the background in the normal sibling stack. A negative z-index can
  // place it behind the clipped viewport on Android; render order keeps later
  // floor and character layers above it.
  backgroundLayer: { zIndex: layers.spriteFloor },
  floorUnder: { zIndex: layers.spriteFloor },
  itemLayer: { zIndex: layers.spriteItem },
});
