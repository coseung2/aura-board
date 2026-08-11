import type { CSSProperties } from "react";
import type { SlimeFrame } from "@/lib/pets/slime-assets";
import type { ResolvedSlimeWearable } from "@/lib/pets/slime-wearables";
import { slimeFrameOffset } from "@/lib/pets/slime-sprite-geometry";

const SLIME_PROP_LAYER_Z = 501;

export function frameSourceStyle(
  frame: SlimeFrame,
  sheetWidth: number,
  sheetHeight: number,
  scale: number,
  offsetY = 0,
): CSSProperties {
  const offset = slimeFrameOffset(frame, scale, offsetY);
  return {
    width: sheetWidth * scale,
    height: sheetHeight * scale,
    transform: `translate(${offset.left}px, ${offset.top}px)`,
  };
}

export function wearableViewportStyle(
  wearable: ResolvedSlimeWearable,
  scale: number,
  sceneInsetX: number,
  sceneInsetY: number,
  riderOffsetY = 0,
  frontmost = false,
): CSSProperties {
  return {
    width: wearable.frameSize.w * scale,
    height: wearable.frameSize.h * scale,
    left: sceneInsetX + wearable.dx * scale,
    top: sceneInsetY + (wearable.dy - wearable.characterOffsetY) * scale + riderOffsetY,
    zIndex: frontmost ? SLIME_PROP_LAYER_Z : 2 + wearable.zIndex,
  };
}

export function wearableSheetStyle(
  wearable: ResolvedSlimeWearable,
  scale: number,
): CSSProperties {
  return {
    width: wearable.sheetWidth * scale,
    height: wearable.sheetHeight * scale,
    transform: `translate(${-wearable.sourceFrame * wearable.frameSize.w * scale}px, 0px)`,
  };
}

export function resolveSpritePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return `/${value}`;
}
