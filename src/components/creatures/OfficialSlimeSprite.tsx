"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  SLIME_SHARED_ASSETS,
  getSlimeFrame,
  resolveSlimeAsset,
  type EquippedFloor,
  type SlimeAction,
  type SlimeColor,
  type SlimeEvolution,
  type SlimeFrame,
} from "@/lib/pets/slime-assets";

import styles from "./OfficialSlimeSprite.module.css";

export type OfficialSlimeSpriteProps = {
  slimeColor: SlimeColor;
  evolution?: SlimeEvolution;
  action?: SlimeAction;
  equippedFloor?: EquippedFloor;
  /** Integer source-pixel scale. The official artwork is authored at 64px. */
  scale?: number;
  className?: string;
  alt?: string;
  dataSlimeColor?: SlimeColor;
  /** Legacy shop props are complete character images, not sheet overlays. */
  itemSpritePath?: string;
  /** Repeat a normally one-shot action when it is used as a passive preview. */
  repeat?: boolean;
  onComplete?: () => void;
};

const DEFAULT_SCALE = 1;

function integerScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SCALE;
  return Math.max(1, Math.round(value as number));
}

function frameSourceStyle(
  frame: SlimeFrame,
  sheetWidth: number,
  sheetHeight: number,
  scale: number,
  sourceOffsetY: number,
): CSSProperties {
  // Texture-packer's spriteSourceSize is the placement inside the untrimmed
  // source frame. Keeping that placement here means trimmed and crowned
  // (64x75) frames retain their authored footprint.
  const left = (frame.spriteSourceSize.x - frame.frame.x) * scale;
  const top = (frame.spriteSourceSize.y - frame.frame.y) * scale + sourceOffsetY;

  return {
    width: sheetWidth * scale,
    height: sheetHeight * scale,
    transform: `translate(${left}px, ${top}px)`,
  };
}

function frameViewportStyle(frame: SlimeFrame, scale: number): CSSProperties {
  return {
    width: frame.sourceSize.w * scale,
    height: frame.sourceSize.h * scale,
  };
}

/**
 * Plays the imported official sheet for one semantic slime state. The sheet
 * itself is never animated with CSS: JSON frame durations drive a timer so
 * one-shot actions can return to the parent's idle state exactly at the end.
 */
export function OfficialSlimeSprite({
  slimeColor,
  evolution = "base",
  action = "idle",
  equippedFloor = "none",
  scale: requestedScale = DEFAULT_SCALE,
  className = "",
  alt,
  dataSlimeColor,
  itemSpritePath,
  repeat = false,
  onComplete,
}: OfficialSlimeSpriteProps) {
  const scale = integerScale(requestedScale);
  const resolution = useMemo(
    () => resolveSlimeAsset({
      slimeColor,
      evolution,
      action,
      equippedFloor,
    }),
    [action, equippedFloor, evolution, slimeColor],
  );
  const playbackKey = `${resolution.key}:${resolution.action}:${resolution.equippedFloor}`;
  const [frameIndex, setFrameIndex] = useState(0);
  const completedPlaybackRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const frame = getSlimeFrame(resolution, frameIndex);
  const staticFloor = resolution.staticFloor;
  const puddleAsset = equippedFloor === "water-puddle"
    ? SLIME_SHARED_ASSETS.sharedPuddle
    : null;
  const puddleFrame = puddleAsset
    ? puddleAsset.metadata.frames[frameIndex % puddleAsset.metadata.frames.length]
    : null;
  const puddleStyle = puddleAsset && puddleFrame
    ? frameSourceStyle(
        puddleFrame,
        puddleAsset.metadata.meta.size.w,
        puddleAsset.metadata.meta.size.h,
        scale,
        0,
      )
    : undefined;
  const sourceOffsetY = staticFloor
    ? (staticFloor.surfaceY - staticFloor.slimeFootY) * scale
    : 0;
  const viewportStyle = frameViewportStyle(frame, scale);
  const sheetStyle = frameSourceStyle(
    frame,
    resolution.metadata.meta.size.w,
    resolution.metadata.meta.size.h,
    scale,
    sourceOffsetY,
  );
  const crownStyle = resolution.crownOverlay
    ? {
        width: 64 * resolution.crownOverlay.imageScale * scale,
        height: 64 * resolution.crownOverlay.imageScale * scale,
        transform: `translate(0px, ${sourceOffsetY}px)`,
      }
    : undefined;
  const label = alt ?? `${slimeColor} 슬라임 ${resolution.action} 모습`;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setFrameIndex(0);
    completedPlaybackRef.current = null;
  }, [playbackKey]);

  useEffect(() => {
    const currentFrame = getSlimeFrame(resolution, frameIndex);
    const timeoutId = window.setTimeout(() => {
      const isLastFrame = frameIndex >= resolution.frameCount - 1;
      if (resolution.oneShot && !repeat && isLastFrame) {
        if (completedPlaybackRef.current !== playbackKey) {
          completedPlaybackRef.current = playbackKey;
          onCompleteRef.current?.();
        }
        return;
      }

      setFrameIndex((current) => {
        if (resolution.loop || repeat) return (current + 1) % resolution.frameCount;
        return Math.min(current + 1, resolution.frameCount - 1);
      });
    }, Math.max(0, currentFrame.duration));

    return () => window.clearTimeout(timeoutId);
  }, [frameIndex, playbackKey, repeat, resolution]);

  return (
    <div
      className={`${styles.viewport} ${className}`.trim()}
      style={viewportStyle}
      role="img"
      aria-label={label}
      data-slime-asset-key={resolution.key}
      data-slime-color={dataSlimeColor ?? slimeColor}
      data-slime-action={resolution.action}
      data-equipped-floor={resolution.equippedFloor}
      data-item-sprite-path={itemSpritePath}
      data-frame-index={frameIndex}
      data-frame-duration={frame.duration}
      data-floor-offset-source-pixels={staticFloor ? staticFloor.surfaceY - staticFloor.slimeFootY : 0}
    >
      {itemSpritePath ? (
        // Older shop props are authored as complete looping GIFs. Render the
        // persisted prop in the same viewport while keeping the semantic
        // asset metadata above for callers and accessibility.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={itemSpritePath}
          alt=""
          aria-hidden="true"
          className={styles.sheet}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            zIndex: 1,
          }}
          draggable={false}
        />
      ) : (
        <>
          {puddleAsset && puddleFrame ? (
            // The slime interaction sheet contains only the character. The
            // shared puddle sheet is authored separately and plays in sync.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={puddleAsset.sheetUrl}
              alt=""
              aria-hidden="true"
              className={styles.puddle}
              style={puddleStyle}
              draggable={false}
            />
          ) : null}
          {/* The raw packed sheet is intentionally not a Next Image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolution.sheetUrl}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={sheetStyle}
            draggable={false}
          />
          {resolution.crownOverlay ? (
        // Crown overlays are generated by the importer from the official
        // evolved/base diff; they share the same source-pixel coordinate.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolution.crownOverlay.imageUrl}
          alt=""
          aria-hidden="true"
          className={styles.crown}
          style={crownStyle}
          draggable={false}
        />
          ) : null}
        </>
      )}
      {staticFloor ? (
        // Grass is a static composition layer. It deliberately comes after
        // every character path so its foreground pixels cover the feet.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staticFloor.imageUrl}
          alt=""
          aria-hidden="true"
          className={styles.floor}
          style={{
            width: 64 * staticFloor.imageScale * scale,
            height: 64 * staticFloor.imageScale * scale,
          }}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
