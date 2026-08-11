"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";

import {
  SLIME_SHARED_ASSETS,
  getSlimeFrame,
  resolveSlimeAsset,
  type EquippedFloor,
  type SlimeAction,
  type SlimeColor,
  type SlimeEvolution,
  type SlimeSheetAction,
} from "@/lib/pets/slime-assets";
import {
  resolveSlimeBallPropAsset,
  resolveSlimePropAction,
  slimePropFrameOffset,
  type SlimePropAction,
} from "@/lib/pets/slime-props";
import {
  resolveSlimeWearables,
  type ResolvedSlimeWearable,
  type SlimeWearableSelection,
} from "@/lib/pets/slime-wearables";
import {
  SLIME_DEFAULT_RENDERER_SCALE,
  normalizeSlimeRendererScale,
  resolveSlimeSpriteGeometry,
} from "@/lib/pets/slime-sprite-geometry";

import styles from "./OfficialSlimeSprite.module.css";
import {
  useGroundedVehiclePlayback,
  useSlimeSpritePlayback,
} from "./useSlimeSpritePlayback";
import {
  frameSourceStyle,
  resolveSpritePath,
  wearableSheetStyle,
  wearableViewportStyle,
} from "./OfficialSlimeSprite.styles";

/** Single-pass H(x)*V(y) feather mask, identical to the mobile shared asset. */
const SCENE_BACKGROUND_FEATHER_MASK =
  "/creatures/slimes/official/shared/scene-background-feather-mask.png";

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
  /**
   * Integer renderer scale for the logical 64px viewport.
   * Prefer this over CSS transforms so vehicle passengers, effects, and pixel art stay on integer CSS pixels.
   */
  scale?: number;
  /** Alias for `scale`; kept for call sites that speak in renderer terms. */
  rendererScale?: number;
  className?: string;
  alt?: string;
  dataSlimeColor?: SlimeColor;
  /**
   * Legacy complete-GIF fallback for unsupported static props only.
   * Catalog balls and drinks must use `propAction` composition instead.
   */
  itemSpritePath?: string;
  /**
   * Composable equipped prop (ball / drink). Matches mobile pet-card contract:
   * character, wearables, and vehicles remain layered.
   */
  propAction?: SlimePropAction | null;
  /** Optional scene art rendered behind every other visual layer. Sources may be 64x64 or 128x128 while remaining in the fixed 64px logical viewport. */
  backgroundSpritePath?: string;
  /** Scene backgrounds feather by default; shop previews use an edge-to-edge image. */
  featherBackground?: boolean;
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
  /** Horizontal correction applied only to vehicle-owned art layers. */
  vehicleOffsetX?: number;
  /**
   * Anchor-composed wearable layers. Each equippable role is optional; omitted
   * roles simply contribute no overlay.
   */
  wearables?: SlimeWearableSelection;
  /** Drink flavor selecting the wearable drink timeline and character sheet. */
  drinkFlavor?: string | null;
  /** Loop one-shot actions when used as a passive preview. */
  repeat?: boolean;
  onComplete?: () => void;
};

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
  scale: requestedScale,
  rendererScale: requestedRendererScale,
  className = "",
  alt,
  dataSlimeColor,
  itemSpritePath,
  propAction,
  backgroundSpritePath,
  featherBackground = true,
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
  vehicleOffsetX = 0,
  wearables,
  drinkFlavor,
  repeat = false,
  onComplete,
}: OfficialSlimeSpriteProps) {
  const scale = normalizeSlimeRendererScale(
    requestedRendererScale ?? requestedScale ?? SLIME_DEFAULT_RENDERER_SCALE,
  );
  const requestedPropAction = useMemo<SlimePropAction | null>(
    () =>
      propAction ??
      (action === "drink" && drinkFlavor
        ? {
            kind: "drink",
            itemKey: `drink:${drinkFlavor}`,
            flavor: drinkFlavor,
          }
        : null),
    [action, drinkFlavor, propAction],
  );
  const actionResolution = useMemo(
    () => resolveSlimePropAction(action, requestedPropAction, equippedFloor),
    [action, equippedFloor, requestedPropAction],
  );
  const resolution = useMemo(
    () =>
      resolveSlimeAsset({
        slimeColor,
        evolution,
        action: actionResolution.characterAction,
        equippedFloor,
        growthStage,
        equippedHeadwear: wearables?.headwear ?? null,
        drinkFlavor:
          actionResolution.prop?.kind === "drink"
            ? actionResolution.prop.flavor
            : drinkFlavor,
      }),
    [
      actionResolution.characterAction,
      actionResolution.prop,
      drinkFlavor,
      equippedFloor,
      evolution,
      growthStage,
      slimeColor,
      wearables?.headwear,
    ],
  );
  const ballAsset =
    actionResolution.prop?.kind === "ball"
      ? resolveSlimeBallPropAsset(actionResolution.prop.slug, slimeColor)
      : null;
  const playbackKey = `${resolution.key}:${actionResolution.wearableAction}:${resolution.equippedFloor}:${actionResolution.prop?.itemKey ?? "none"}`;
  const playbackFrameCount = ballAsset?.frameCount ?? resolution.frameCount;
  const playbackLoops = Boolean(ballAsset) || resolution.loop;
  const playbackIsOneShot = ballAsset ? false : resolution.oneShot;
  const frameIndex = useSlimeSpritePlayback({
    playbackKey,
    frameCount: playbackFrameCount,
    durationForFrame: (candidateFrame) =>
      ballAsset
        ? (ballAsset.durations[candidateFrame % ballAsset.frameCount] ?? 0)
        : getSlimeFrame(resolution, candidateFrame).duration,
    loops: playbackLoops,
    oneShot: playbackIsOneShot,
    repeat,
    onComplete,
  });

  const frame = getSlimeFrame(resolution, frameIndex);
  const staticFloor = resolution.staticFloor;
  const puddleAsset =
    equippedFloor === "water-puddle" ? SLIME_SHARED_ASSETS.sharedPuddle : null;
  const puddleFrame = puddleAsset
    ? puddleAsset.metadata.frames[
        frameIndex % puddleAsset.metadata.frames.length
      ]
    : null;
  const vehicleBobSource = vehicleBobY?.length
    ? Math.trunc(vehicleBobY[frameIndex % vehicleBobY.length] ?? 0)
    : 0;
  const label = alt ?? `${slimeColor} 슬라임 ${resolution.action} 모습`;
  const resolvedBackgroundSpritePath = resolveSpritePath(backgroundSpritePath);
  const resolvedVehicleSpritePath = resolveSpritePath(vehicleSpritePath);
  const resolvedVehicleGroundedSpritePath = resolveSpritePath(
    vehicleGroundedSpritePath,
  );
  const resolvedVehicleEffectSpritePaths = (vehicleEffectSpritePaths ?? [])
    .map(resolveSpritePath)
    .filter((path): path is string => Boolean(path));
  const hasVehicleScene = Boolean(
    resolvedVehicleSpritePath ||
      resolvedVehicleGroundedSpritePath ||
      resolvedVehicleEffectSpritePaths.length,
  );
  // Scene art must never depend on every caller remembering a viewport opt-in.
  // Avatar-only sprites remain 64px, while any visible scene surface gets the
  // shared wider canvas automatically. Prop actions expand like mobile.
  const hasExpandedSceneSurfaces = Boolean(
    hasVehicleScene ||
      resolvedBackgroundSpritePath ||
      staticFloor ||
      equippedFloor === "water-puddle" ||
      equippedFloor === "trampoline" ||
      requestedPropAction ||
      expandSceneSurfaces,
  );
  const { geometry, viewportHeight } = resolveSlimeSpriteGeometry({
    sourceWidth: frame.sourceSize.w,
    sourceHeight: frame.sourceSize.h,
    rendererScale: scale,
    expandedScene: hasExpandedSceneSurfaces,
    vehicleRiseY,
    vehicleBobY: vehicleBobSource,
    vehicleCharacterOffsetY,
    vehicleOffsetX,
    vehicleCanvasHeight,
    staticFloor,
  });
  const {
    baseWidth,
    baseHeight,
    sceneWidth,
    sceneHeight,
    sceneInsetX,
    sceneInsetY,
    floorWidth,
    floorHeight,
    floorInsetX,
    riderOffsetY,
    vehicleTop,
    vehicleLeft,
    vehicleCanvasHeight: vehicleCanvas,
    vehicleFrameWidth,
    expandedFloorTop,
  } = geometry;
  const puddleStyle =
    puddleAsset && puddleFrame
      ? frameSourceStyle(
          puddleFrame,
          puddleAsset.metadata.meta.size.w,
          puddleAsset.metadata.meta.size.h,
          scale,
          0,
        )
      : undefined;
  const sheetStyle = frameSourceStyle(
    frame,
    resolution.metadata.meta.size.w,
    resolution.metadata.meta.size.h,
    scale,
    riderOffsetY,
  );
  const ballPackedSheetSize = ballAsset
    ? {
        width: ballAsset.sheetWidth * scale,
        height: ballAsset.sheetHeight * scale,
      }
    : null;
  const ballOffset = ballAsset
    ? slimePropFrameOffset(frameIndex, ballAsset, scale)
    : null;
  const viewportStyle: CSSProperties = {
    width: sceneWidth,
    height: viewportHeight,
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
  const groundedFrame = useGroundedVehiclePlayback({
    enabled: Boolean(vehicleGroundedSpritePath),
    frameCount: vehicleGroundedFrames,
    frameDurationMs: vehicleGroundedFrameDurationMs,
  });

  /**
   * Vehicle art is authored on a taller canvas whose headroom sits above the
   * grounded pose. Geometry already subtracts characterOffsetY so the art lands
   * on the fixed slime-foot baseline without reapplying floor rise.
   */
  const vehicleSheetStyle = (
    sheetFrames: number,
    activeFrame: number,
  ): CSSProperties => ({
    width: vehicleFrameWidth * sheetFrames,
    height: vehicleCanvas * scale,
    transform: `translate(${-(activeFrame % sheetFrames) * vehicleFrameWidth}px, 0px)`,
  });

  // Wearables compose onto the character sheet. Legacy complete-GIF props
  // replace that sheet entirely, so the two paths stay mutually exclusive.
  // The head slot is owned by the resolver: it decides whether this action draws
  // the growth crown, a player hat, or nothing. Other roles come from the
  // caller's selection. Ball action drives wearableAction "ball-hit".
  const resolvedWearables = useMemo(() => {
    if (itemSpritePath || resolution.composition.mode !== "composed") return [];
    const selection = { ...wearables, headwear: resolution.renderedHeadwear };
    // ball-hit is a wearable timeline key, not a character sheet action.
    // Web wearable resolver is typed to sheet actions; ball-hit is a valid
    // generated timeline key and matches the mobile wearable action contract.
    return resolveSlimeWearables(
      selection,
      slimeColor,
      actionResolution.wearableAction as unknown as SlimeSheetAction,
      frameIndex,
      resolution.drinkFlavor,
    );
  }, [
    actionResolution.wearableAction,
    frameIndex,
    itemSpritePath,
    resolution.composition.mode,
    resolution.drinkFlavor,
    resolution.renderedHeadwear,
    slimeColor,
    wearables,
  ]);
  const equipmentWearables = resolvedWearables.filter(
    (wearable) => wearable.role !== "drink",
  );
  const propWearables = resolvedWearables.filter(
    (wearable) => wearable.role === "drink",
  );


  const renderWearableLayers = (
    items: readonly ResolvedSlimeWearable[],
    frontmost = false,
  ) =>
    items.map((wearable) => (
      <div
        key={wearable.key}
        className={`${styles.frameViewport} ${frontmost ? styles.propLayer : styles.wearableFrame}`.trim()}
        style={wearableViewportStyle(
          wearable,
          scale,
          sceneInsetX,
          sceneInsetY,
          riderOffsetY,
          frontmost,
        )}
        data-wearable-role={wearable.role}
        data-wearable-source-frame={wearable.sourceFrame}
        data-slime-prop-overlay={frontmost ? "true" : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wearable.imageUrl}
          alt=""
          aria-hidden="true"
          className={styles.sheet}
          style={wearableSheetStyle(wearable, scale)}
          draggable={false}
        />
      </div>
    ));

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
      data-prop-action={actionResolution.prop?.itemKey}
      data-prop-kind={actionResolution.prop?.kind}
      data-background-sprite-path={resolvedBackgroundSpritePath ?? undefined}
      data-frame-index={frameIndex}
      data-frame-duration={
        ballAsset
          ? ballAsset.durations[frameIndex % ballAsset.frameCount]
          : frame.duration
      }
      data-wearable-keys={
        resolvedWearables.length > 0
          ? resolvedWearables.map((wearable) => wearable.key).join(",")
          : undefined
      }
      data-head-slot={resolution.headSlot?.option ?? undefined}
      data-head-slot-source={resolution.headSlot?.source ?? undefined}
      data-composition-mode={resolution.composition.mode}
      data-floor-offset-source-pixels={
        staticFloor ? staticFloor.slimeFootY - staticFloor.surfaceY : 0
      }
      data-expanded-scene={hasExpandedSceneSurfaces ? "true" : "false"}
      data-renderer-scale={scale}
      data-scene-width={sceneWidth}
      data-scene-height={sceneHeight}
      data-vehicle-rise={geometry.vehicleRise}
      data-vehicle-top={vehicleTop}
      data-vehicle-left={vehicleLeft}
      data-rider-offset-y={riderOffsetY}
    >
      {resolvedBackgroundSpritePath ? (
        <div
          className={featherBackground ? styles.backgroundFeather : styles.backgroundFull}
          data-background-feather={featherBackground ? "mask-product" : "none"}
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
          className={`${styles.frameViewport} ${styles.floorUnder}`}
          style={{
            width: baseWidth,
            height: baseHeight,
            left: sceneInsetX,
            top: sceneInsetY,
          }}
        >
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
          className={`${styles.frameViewport} ${styles.floorUnder}`}
          style={{
            width: vehicleFrameWidth,
            height: vehicleCanvas * scale,
            left: sceneInsetX + vehicleLeft,
            top: sceneInsetY + vehicleTop,
          }}
        >
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
        // Unsupported legacy static props only. Catalog balls/drinks use propAction.
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
      ) : ballAsset && ballPackedSheetSize && ballOffset ? (
        <div
          className={styles.frameViewport}
          data-slime-ball-action-layer="true"
          style={{
            width: sceneWidth,
            height: sceneHeight,
            left: 0,
            top: riderOffsetY,
            zIndex: 1,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ballAsset.actionSheetUrl}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={{
              width: ballPackedSheetSize.width,
              height: ballPackedSheetSize.height,
              transform: `translate(${ballOffset.left}px, ${ballOffset.top}px)`,
            }}
            draggable={false}
          />
        </div>
      ) : (
        <div
          className={styles.frameViewport}
          data-slime-character-layer="true"
          style={{
            width: baseWidth,
            height: baseHeight,
            left: sceneInsetX,
            top: sceneInsetY,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolution.sheetUrl}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={sheetStyle}
            draggable={false}
          />
        </div>
      )}
      {!itemSpritePath ? renderWearableLayers(equipmentWearables) : null}
      {resolvedVehicleSpritePath ? (
        <div
          className={styles.frameViewport}
          data-slime-vehicle-layer="true"
          style={{
            width: vehicleFrameWidth,
            height: vehicleCanvas * scale,
            left: sceneInsetX + vehicleLeft,
            top: sceneInsetY + vehicleTop,
            zIndex: 200,
          }}
        >
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
          className={styles.frameViewport}
          style={{
            width: vehicleFrameWidth,
            height: vehicleCanvas * scale,
            left: sceneInsetX + vehicleLeft,
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
      {resolution.happyHeart ? (
        <div
          className={styles.frameViewport}
          style={{
            width: baseWidth,
            height: baseHeight,
            left: sceneInsetX,
            top: sceneInsetY,
            zIndex: 400,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolution.happyHeart.imageUrl}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={sheetStyle}
            data-happy-heart-layer="top"
            draggable={false}
          />
        </div>
      ) : null}
      {ballAsset && ballPackedSheetSize && ballOffset ? (
        <div
          className={`${styles.frameViewport} ${styles.propLayer}`}
          data-slime-prop-overlay="true"
          data-slime-ball-prop-layer="true"
          style={{
            width: sceneWidth,
            height: sceneHeight,
            left: 0,
            top: riderOffsetY,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ballAsset.overlaySheetUrl}
            alt=""
            aria-hidden="true"
            className={styles.sheet}
            style={{
              width: ballPackedSheetSize.width,
              height: ballPackedSheetSize.height,
              transform: `translate(${ballOffset.left}px, ${ballOffset.top}px)`,
            }}
            draggable={false}
          />
        </div>
      ) : null}
      {!itemSpritePath ? renderWearableLayers(propWearables, true) : null}
    </div>
  );
}
