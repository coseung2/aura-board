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
import {
  resolveSlimeWearables,
  type ResolvedSlimeWearable,
  type SlimeWearableSelection,
} from "@/lib/pets/slime-wearables";

import styles from "./OfficialSlimeSprite.module.css";

export type OfficialSlimeSpriteProps = {
  slimeColor: SlimeColor;
  /**
   * Persisted evolution. Prefer `growthStage`; this remains for callers that
   * only carry the evolution, and the resolver derives a stage from it.
   */
  evolution?: SlimeEvolution;
  /** Growth stage owning the default crown, which a chosen hat outranks. */
  growthStage?: number;
  action?: SlimeAction;
  equippedFloor?: EquippedFloor;
  /** Integer logical viewport scale. Character art is authored at 64px; scene backgrounds may be authored at 64px or 128px while using the same logical viewport. */
  scale?: number;
  className?: string;
  alt?: string;
  dataSlimeColor?: SlimeColor;
  /** Legacy shop props are complete character images, not sheet overlays. */
  itemSpritePath?: string;
  /** Optional scene art rendered behind every other visual layer. Sources may be 64x64 or 128x128 while remaining in the fixed 64px logical viewport. */
  backgroundSpritePath?: string;
  /**
   * Force the wider scene viewport before a scene asset is attached. Backgrounds,
   * floors, trampolines, and vehicles opt into it automatically.
   */
  expandSceneSurfaces?: boolean;
  /**
   * Vehicle art the slime rides. Vehicles never replace the floor: a grounded
   * vehicle rests on the same surface the floor draws, and a floating one simply
   * sits higher, so a player who wants water under a tube buys that background.
   *
   * Drawn above the character as a single layer. Anything the character would
   * hide is never authored, which is why there is no separate back sheet.
   */
  vehicleSpritePath?: string;
  /**
   * Extra vehicle layer that must stay put while the body moves, such as wheels
   * that would otherwise lift off the ground with the suspension bounce.
   */
  vehicleGroundedSpritePath?: string;
  /** Transparent effect sheets synchronized to the vehicle's main frame clock. */
  vehicleEffectSpritePaths?: readonly string[];
  /** Frames in the vehicle body sheet. One means a single static image. */
  vehicleFrameCount?: number;
  /** Frames in the grounded-part sheet, such as a wheel rotation. */
  vehicleGroundedFrameCount?: number;
  /**
   * Fixed frame duration for the grounded part, in milliseconds.
   *
   * A wheel turns at a constant rate while the body follows the slime's variable
   * idle timing, so the two cannot share one frame index without the rotation
   * stuttering.
   */
  vehicleGroundedFrameDurationMs?: number;
  /**
   * Height of the vehicle canvas.
   *
   * Vehicles are authored taller than the character viewport so a balloon can
   * climb above the grounded pose. `vehicleCharacterOffsetY` says where the
   * character sits inside that canvas, and the renderer subtracts it to land the
   * art back on the 64px viewport.
   */
  vehicleCanvasHeight?: number;
  /** Where the character sits inside the taller vehicle canvas. */
  vehicleCharacterOffsetY?: number;
  /**
   * Per-frame vertical bob authored into the vehicle, in viewport pixels.
   *
   * The rider follows it. A vehicle that bobs while its passenger holds still
   * looks like the passenger is sliding out of the seat.
   */
  vehicleBobY?: readonly number[];
  /**
   * Pixels the slime is lifted by the vehicle, in 64px-viewport units. Added on
   * top of the floor rise so a vehicle and a floor stay independently correct.
   *
   * Deliberately a fixed offset. Adding a per-frame offset would stack on the
   * slime's own idle squash and double the amplitude, which reads as hovering.
   */
  vehicleRiseY?: number;
  /**
   * Anchor-composed wearable layers. Each equipped option is one shared sheet
   * repositioned per frame, so new drinks never require rebaking wearables.
   */
  wearables?: SlimeWearableSelection;
  /** Drink flavor selecting the wearable drink timeline, such as `lemonade`. */
  drinkFlavor?: string | null;
  /** Repeat a normally one-shot action when it is used as a passive preview. */
  repeat?: boolean;
  onComplete?: () => void;
};

const DEFAULT_SCALE = 1;
const SCENE_SCALE = 1.5;
const FLOOR_SCALE = 1.375;

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

/**
 * Position one wearable frame inside the viewport.
 *
 * The sheet is shifted so the anchor's source column lands at the origin, then
 * nudged by the per-frame `(dx, dy)` offset authored for that timeline.
 *
 * Jump actions are authored on a taller canvas whose extra headroom sits above
 * the grounded pose, so `characterOffsetY` is subtracted to bring the overlay
 * back onto the character's own 64px viewport. Grounded actions report zero, so
 * both families share one formula.
 */
function wearableStyle(
  wearable: ResolvedSlimeWearable,
  scale: number,
  riderOffsetY = 0,
): CSSProperties {
  const left = (-wearable.sourceFrame * wearable.frameSize.w + wearable.dx) * scale;
  // Hats ride the head, so they take the same seat offset the character does.
  const top = (wearable.dy - wearable.characterOffsetY) * scale + riderOffsetY;
  return {
    width: wearable.sheetWidth * scale,
    height: wearable.sheetHeight * scale,
    transform: `translate(${left}px, ${top}px)`,
  };
}

function resolveSpritePath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || path.startsWith("/")) return path;
  return `/${path}`;
}

/**
 * Plays the imported official sheet for one semantic slime state. The sheet
 * itself is never animated with CSS: JSON frame durations drive a timer so
 * one-shot actions can return to the parent's idle state exactly at the end.
 */
export function OfficialSlimeSprite({
  slimeColor,
  evolution = "base",
  growthStage,
  action = "idle",
  equippedFloor = "none",
  scale: requestedScale = DEFAULT_SCALE,
  className = "",
  alt,
  dataSlimeColor,
  itemSpritePath,
  backgroundSpritePath,
  expandSceneSurfaces = false,
  vehicleSpritePath,
  vehicleGroundedSpritePath,
  vehicleEffectSpritePaths,
  vehicleFrameCount = 1,
  vehicleGroundedFrameCount = 1,
  vehicleGroundedFrameDurationMs = 100,
  vehicleCanvasHeight = 64,
  vehicleCharacterOffsetY = 0,
  vehicleBobY,
  vehicleRiseY = 0,
  wearables,
  drinkFlavor,
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
      growthStage,
      equippedHeadwear: wearables?.headwear ?? null,
      drinkFlavor,
    }),
    [action, drinkFlavor, equippedFloor, evolution, growthStage, slimeColor, wearables?.headwear],
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
  // A vehicle lifts the slime on top of whatever the floor already contributed,
  // so the two offsets add instead of overriding each other.
  const vehicleRise = Math.max(0, Math.trunc(vehicleRiseY)) * scale;
  const vehicleBob = vehicleBobY?.length
    ? Math.trunc(vehicleBobY[frameIndex % vehicleBobY.length] ?? 0)
    : 0;
  /**
   * Rider offset: the seat height plus this frame's bob.
   *
   * `vehicleRiseY` alone would leave the slime still while its seat moves, so the
   * authored bob is added here rather than baked into the character sheet.
   */
  // Authored bob values use screen coordinates: negative is upward. Preserve
  // that sign so the rider follows the vehicle instead of moving against it.
  const riderOffsetY = -vehicleRise + vehicleBob * scale;
  const sheetStyle = frameSourceStyle(
    frame,
    resolution.metadata.meta.size.w,
    resolution.metadata.meta.size.h,
    scale,
    riderOffsetY,
  );
  const label = alt ?? `${slimeColor} 슬라임 ${resolution.action} 모습`;
  const resolvedBackgroundSpritePath = resolveSpritePath(backgroundSpritePath);
  const resolvedVehicleSpritePath = resolveSpritePath(vehicleSpritePath);
  const resolvedVehicleGroundedSpritePath = resolveSpritePath(vehicleGroundedSpritePath);
  const resolvedVehicleEffectSpritePaths = (vehicleEffectSpritePaths ?? [])
    .map(resolveSpritePath)
    .filter((path): path is string => Boolean(path));
  const hasVehicleScene = Boolean(
    resolvedVehicleSpritePath
      || resolvedVehicleGroundedSpritePath
      || resolvedVehicleEffectSpritePaths.length,
  );
  // Scene art must never depend on every caller remembering a viewport opt-in.
  // Avatar-only sprites remain 64px, while any visible scene surface gets the
  // shared wider canvas automatically.
  const hasExpandedSceneSurfaces = Boolean(
    hasVehicleScene
      || resolvedBackgroundSpritePath
      || staticFloor
      || equippedFloor === "water-puddle"
      || equippedFloor === "trampoline"
      || expandSceneSurfaces,
  );
  const baseWidth = frame.sourceSize.w * scale;
  const baseHeight = frame.sourceSize.h * scale;
  const sceneScale = hasExpandedSceneSurfaces ? SCENE_SCALE : 1;
  const floorScale = hasExpandedSceneSurfaces ? FLOOR_SCALE : 1;
  const sceneWidth = baseWidth * sceneScale;
  const sceneHeight = baseHeight * sceneScale;
  const sceneInsetX = (sceneWidth - baseWidth) / 2;
  const sceneInsetY = (sceneHeight - baseHeight) / 2;
  const floorWidth = baseWidth * floorScale;
  const floorHeight = baseHeight * floorScale;
  const floorInsetX = (sceneWidth - floorWidth) / 2;
  const expandedFloorTop = staticFloor
    ? sceneInsetY
      + staticFloor.slimeFootY * scale
      - staticFloor.surfaceY * scale * floorScale
    : 0;
  const viewportStyle: CSSProperties = {
    width: sceneWidth,
    height: Math.max(
      sceneHeight,
      sceneInsetY + baseHeight + floorRise + vehicleRise,
      staticFloor ? expandedFloorTop + floorHeight : 0,
    ),
  };
  /**
   * Vehicle sheets share the character's frame clock, so a rider and its ride
   * stay in step. Authored durations match the slime idle timeline, which is why
   * one index can drive both.
   */
  const vehicleFrames = Math.max(1, Math.trunc(vehicleFrameCount));
  const vehicleGroundedFrames = Math.max(1, Math.trunc(vehicleGroundedFrameCount));
  /**
   * Wheels run on their own clock.
   *
   * The body shares the character's frame index so a bob stays in step with the
   * rider, but a constant-rate rotation driven by that variable timing would
   * speed up and slow down within one loop.
   */
  const [groundedFrame, setGroundedFrame] = useState(0);
  useEffect(() => {
    if (!vehicleGroundedSpritePath || vehicleGroundedFrames <= 1) return;
    const period = Math.max(16, Math.trunc(vehicleGroundedFrameDurationMs));
    const timer = window.setInterval(() => {
      setGroundedFrame((current) => (current + 1) % vehicleGroundedFrames);
    }, period);
    return () => window.clearInterval(timer);
  }, [vehicleGroundedFrameDurationMs, vehicleGroundedFrames, vehicleGroundedSpritePath]);

  /**
   * Vehicle art is authored on a taller canvas whose headroom sits above the
   * grounded pose. Static floors align their surface to the fixed slime-foot
   * baseline independently, so adding `floorRise` here would sink the vehicle.
   */
  const vehicleTop = -Math.trunc(vehicleCharacterOffsetY) * scale;
  const vehicleSheetStyle = (
    sheetFrames: number,
    activeFrame: number,
  ): CSSProperties => ({
    width: 64 * sheetFrames * scale,
    height: Math.trunc(vehicleCanvasHeight) * scale,
    transform: `translate(${-(activeFrame % sheetFrames) * 64 * scale}px, 0px)`,
  });
  // Wearables compose onto the character sheet. Legacy complete-GIF props
  // replace that sheet entirely, so the two paths stay mutually exclusive.
  // The head slot is owned by the resolver: it decides whether this action draws
  // the growth crown, a player hat, or nothing. Other roles come from the
  // caller's selection. Legacy complete-GIF props replace the character sheet
  // entirely, so they suppress all composition.
  const resolvedWearables = useMemo(
    () => {
      if (itemSpritePath || resolution.composition.mode !== "composed") return [];
      // The resolver owns the head slot, including whether this action draws it.
      // Other roles pass through so a chosen drink always shows its own flavor.
      const selection = { ...wearables, headwear: resolution.renderedHeadwear };
      return resolveSlimeWearables(
        selection,
        slimeColor,
        resolution.resolvedAction,
        frameIndex,
        resolution.drinkFlavor,
      );
    },
    [
      frameIndex,
      itemSpritePath,
      resolution.composition.mode,
      resolution.drinkFlavor,
      resolution.renderedHeadwear,
      resolution.resolvedAction,
      slimeColor,
      wearables,
    ],
  );

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
      data-background-sprite-path={resolvedBackgroundSpritePath ?? undefined}
      data-frame-index={frameIndex}
      data-frame-duration={frame.duration}
      data-wearable-keys={resolvedWearables.length > 0
        ? resolvedWearables.map((wearable) => wearable.key).join(",")
        : undefined}
      data-head-slot={resolution.headSlot?.option ?? undefined}
      data-head-slot-source={resolution.headSlot?.source ?? undefined}
      data-composition-mode={resolution.composition.mode}
      data-floor-offset-source-pixels={staticFloor ? staticFloor.slimeFootY - staticFloor.surfaceY : 0}
      data-expanded-scene={hasExpandedSceneSurfaces ? "true" : "false"}
    >
      {resolvedBackgroundSpritePath ? (
        // Scene art may be authored at 64x64 or 128x128. Keep it in the same
        // logical 64x64 viewport below floor, character, prop, and crown layers.
        <div
          className={styles.backgroundFeather}
          data-background-feather="responsive-edge"
          style={{ width: sceneWidth, height: sceneHeight }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedBackgroundSpritePath}
            alt=""
            aria-hidden="true"
            className={styles.background}
            style={{ width: sceneWidth, height: sceneHeight }}
            draggable={false}
          />
        </div>
      ) : null}
      {puddleAsset && puddleFrame ? (
        <div
          className={`${styles.characterFrame} ${styles.floorUnder}`}
          style={{ width: baseWidth, height: baseHeight, left: sceneInsetX, top: sceneInsetY }}
        >
          {/* Keep the shared puddle as an independent floor layer so complete
              prop GIFs can compose above it instead of replacing it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={puddleAsset.sheetUrl}
            alt=""
            aria-hidden="true"
            className={styles.puddle}
            style={puddleStyle}
            draggable={false}
          />
        </div>
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
            width: floorWidth * staticFloor.imageScale,
            height: floorHeight * staticFloor.imageScale,
            left: floorInsetX,
            top: expandedFloorTop,
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
          style={{
            width: floorWidth,
            height: floorHeight,
            left: floorInsetX,
            top: sceneInsetY + baseHeight - floorHeight,
          }}
          draggable={false}
        />
      ) : null}
      {resolvedVehicleGroundedSpritePath ? (
        <div
          className={`${styles.vehicleFrame} ${styles.floorUnder}`}
          style={{
            width: 64 * scale,
            height: Math.trunc(vehicleCanvasHeight) * scale,
            left: sceneInsetX,
            top: sceneInsetY + vehicleTop,
          }}
        >
          {/* Parts that must not move with the body, such as wheels. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedVehicleGroundedSpritePath}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={vehicleSheetStyle(vehicleGroundedFrames, groundedFrame)}
            draggable={false}
          />
        </div>
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
            width: baseWidth,
            height: baseHeight,
            left: sceneInsetX,
            top: sceneInsetY,
            objectFit: "contain",
            zIndex: 1,
          }}
          draggable={false}
        />
      ) : (
        <div
          className={styles.characterFrame}
          style={{ width: baseWidth, height: baseHeight, left: sceneInsetX, top: sceneInsetY }}
        >
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
          {resolvedWearables.map((wearable) => (
            // One shared sheet per option; the anchor track supplies this
            // frame's source column and offset.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={wearable.key}
              src={wearable.imageUrl}
              alt=""
              aria-hidden="true"
              className={styles.wearable}
              style={{
                ...wearableStyle(wearable, scale, riderOffsetY),
                zIndex: 2 + wearable.zIndex,
              }}
              data-wearable-role={wearable.role}
              data-wearable-source-frame={wearable.sourceFrame}
              draggable={false}
            />
          ))}
          {resolution.happyHeart ? (
            // The happy heart is authored separately from the body so it can
            // stay above blush, glasses, hats, and any future prop overlay.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolution.happyHeart.imageUrl}
              alt=""
              aria-hidden="true"
              className={styles.sheet}
              style={{
                ...sheetStyle,
                zIndex: 400,
              }}
              data-happy-heart-layer="top"
              draggable={false}
            />
          ) : null}
        </div>
      )}
      {resolvedVehicleSpritePath ? (
        <div
          className={styles.vehicleFrame}
          style={{
            width: 64 * scale,
            height: Math.trunc(vehicleCanvasHeight) * scale,
            left: sceneInsetX,
            top: sceneInsetY + vehicleTop,
            zIndex: 200,
          }}
        >
          {/* The vehicle itself sits above every character layer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolvedVehicleSpritePath}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={vehicleSheetStyle(vehicleFrames, frameIndex)}
            draggable={false}
          />
        </div>
      ) : null}
      {resolvedVehicleEffectSpritePaths.map((path, index) => (
        <div
          key={path}
          className={styles.vehicleFrame}
          style={{
            width: 64 * scale,
            height: Math.trunc(vehicleCanvasHeight) * scale,
            left: sceneInsetX,
            top: sceneInsetY + vehicleTop,
            zIndex: 301 + index,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={path}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={vehicleSheetStyle(vehicleFrames, frameIndex)}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
