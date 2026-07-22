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

function frameViewportStyle(frame: SlimeFrame, scale: number, extraHeight = 0): CSSProperties {
  return {
    width: frame.sourceSize.w * scale,
    height: frame.sourceSize.h * scale + extraHeight,
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
  const floorRise = staticFloor
    ? (staticFloor.slimeFootY - staticFloor.surfaceY) * scale
    : 0;
  const viewportStyle = frameViewportStyle(frame, scale, floorRise);
  const sheetStyle = frameSourceStyle(
    frame,
    resolution.metadata.meta.size.w,
    resolution.metadata.meta.size.h,
    scale,
    0,
  );
  const crownStyle = resolution.crownOverlay
    ? {
        width: 64 * resolution.crownOverlay.imageScale * scale,
        height: 64 * resolution.crownOverlay.imageScale * scale,
        transform: "translate(0px, 0px)",
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
      data-floor-offset-source-pixels={staticFloor ? staticFloor.slimeFootY - staticFloor.surfaceY : 0}
    >
      {puddleAsset && puddleFrame ? (
        // Keep the shared puddle as an independent floor layer so complete
        // prop GIFs can compose above it instead of replacing it.
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
      {staticFloor ? (
        // The floor owns a separate lower slot. Its authored surface aligns
        // exactly with the unchanged character foot baseline.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staticFloor.imageUrl}
          alt=""
          aria-hidden="true"
          className={`${styles.floor} ${styles.floorUnder}`}
          style={{
            width: 64 * staticFloor.imageScale * scale,
            height: 64 * staticFloor.imageScale * scale,
            top: floorRise,
          }}
          draggable={false}
        />
      ) : null}
      {itemSpritePath && equippedFloor === "trampoline" ? (
        // The official trampoline sheets combine character and floor. This
        // extracted shared floor preserves composition with complete props.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/creatures/slimes/official/shared/trampoline-floor.png"
          alt=""
          aria-hidden="true"
          className={styles.floorUnder}
          style={{ width: 64 * 4 * scale, height: 64 * 4 * scale }}
          draggable={false}
        />
      ) : null}
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
            height: frame.sourceSize.h * scale,
            objectFit: "contain",
            zIndex: 1,
          }}
          draggable={false}
        />
      ) : (
        <>
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
    </div>
  );
}
