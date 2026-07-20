import { useEffect, useMemo, useRef, useState } from "react";
import { Image, type ImageProps } from "expo-image";
import { StyleSheet, View } from "react-native";
import { getApiBase } from "../../lib/api";
import {
  getSlimeFrame,
  resolveSlimeAsset,
  type SlimeAction,
  type SlimeAssetResolution,
  type SlimeColor,
  type SlimeEvolution,
  type EquippedFloor,
  type SlimeFrame,
} from "../../lib/slime-assets";
import type { SlimeSpriteProps } from "./slime-types";

const DEFAULT_DISPLAY_SCALE = 1;
type LocalImageSource = ImageProps["source"];

function integerDisplayScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_DISPLAY_SCALE;
  return Math.max(1, Math.round(value as number));
}

function imageSource(value: unknown): LocalImageSource {
  // The generated registry contains only literal Metro `require` values.
  // Keeping this cast at the render boundary prevents a remote URI from ever
  // entering the sprite player.
  return value as LocalImageSource;
}

function sourceSize(frame: SlimeFrame, resolution: SlimeAssetResolution, scale: number) {
  return {
    width: frame.sourceSize.w * resolution.imageScale * scale,
    height: frame.sourceSize.h * resolution.imageScale * scale,
  };
}

function frameOffset(
  frame: SlimeFrame,
  resolution: SlimeAssetResolution,
  scale: number,
  offsetY: number,
) {
  return {
    left: (frame.spriteSourceSize.x - frame.frame.x) * resolution.imageScale * scale,
    top:
      (frame.spriteSourceSize.y - frame.frame.y) * resolution.imageScale * scale +
      offsetY,
  };
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
  onComplete,
}: SlimeSpriteProps) {
  const displayScale = integerDisplayScale(requestedDisplayScale);
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
  const viewport = sourceSize(frame, resolution, displayScale);
  const staticFloor = resolution.staticFloor;
  const floorOffsetY = staticFloor
    ? (staticFloor.surfaceY - staticFloor.slimeFootY) * resolution.imageScale * displayScale
    : 0;
  const packedSheetSize = {
    width: resolution.metadata.meta.size.w * resolution.imageScale * displayScale,
    height: resolution.metadata.meta.size.h * resolution.imageScale * displayScale,
  };
  const offset = frameOffset(frame, resolution, displayScale, floorOffsetY);
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

  if (itemSpritePath) {
    const uri = itemSpritePath.startsWith("http")
      ? itemSpritePath
      : `${getApiBase()}${itemSpritePath.startsWith("/") ? "" : "/"}${itemSpritePath}`;
    const size = 256 * displayScale;
    const itemSizeStyle = { width: size, height: size };
    return (
      <View
        style={[styles.viewport, itemSizeStyle]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? `${slimeColor} 슬라임 장착 소품 모습`}
        testID="slime-sprite"
      >
        <Image
          source={{ uri }}
          style={itemSizeStyle}
          contentFit="contain"
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
      <Image
        source={imageSource(resolution.sheet)}
        style={[styles.layer, packedSheetSize, offset]}
        contentFit="none"
        allowDownscaling={false}
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
            { left: 0, top: floorOffsetY },
          ]}
          contentFit="none"
          allowDownscaling={false}
          transition={0}
          accessible={false}
        />
      ) : null}
      {staticFloor ? (
        <Image
          source={imageSource(staticFloor.image)}
          style={[
            styles.layer,
            {
              width: frame.sourceSize.w * staticFloor.imageScale * displayScale,
              height: squareSourceSize,
              left: 0,
              top: 0,
            },
          ]}
          contentFit="none"
          allowDownscaling={false}
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
});
