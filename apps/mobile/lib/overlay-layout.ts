import type { ModalProps, ViewStyle } from "react-native";
import { composer, layout, spacing } from "../theme/tokens";

export const MODAL_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait", "portrait-upside-down", "landscape-left", "landscape-right",
];

export type OverlayFrame = { width: number; height: number };
export type SafeInsets = { top: number; right: number; bottom: number; left: number };
export type OverlayAlignment = "center" | "right" | "bottom";

/** Insets belong to the overlay window, not a guessed device/orientation size. */
export function overlayFrameInsets(
  { width, height }: OverlayFrame,
  insets: SafeInsets,
  alignment: OverlayAlignment,
) {
  const gutter = alignment === "center"
    ? (height < layout.compactHeightBreakpoint ? spacing.sm : spacing.xxl)
    : alignment === "bottom" && width >= layout.mobileBreakpoint ? spacing.sm : 0;
  return {
    paddingTop: insets.top + (alignment === "right" ? 0 : gutter),
    paddingRight: insets.right + gutter,
    // Bottom sheets own the bottom inset inside their visible surface.
    paddingBottom: alignment === "bottom" ? 0 : insets.bottom + gutter,
    paddingLeft: insets.left + gutter,
  };
}

function dimension(value: unknown, available: number, fallback: number): number {
  const number = typeof value === "number" ? value
    : typeof value === "string" && value.endsWith("%")
      ? Number.parseFloat(value) * available / 100 : fallback;
  return Number.isFinite(number) ? Math.max(0, Math.min(available, number)) : fallback;
}

/** Resolve caller percentages/minima against the *keyboard-adjusted* frame.
 * A minimum must never force a surface outside the current window.
 */
export function fitOverlaySurface(frame: OverlayFrame, style: ViewStyle = {}): ViewStyle {
  const width = Math.max(0, frame.width);
  const height = Math.max(0, frame.height);
  const maxWidth = Math.min(composer.sheetMaxWidth, dimension(style.maxWidth, width, width));
  const maxHeight = dimension(style.maxHeight, height, height);
  return {
    width: Math.min(maxWidth, dimension(style.width, width, width)),
    maxWidth,
    maxHeight,
    minWidth: 0,
    minHeight: dimension(style.minHeight, maxHeight, 0),
    flexShrink: 1,
    ...(style.height !== undefined ? { height: Math.min(maxHeight, dimension(style.height, height, maxHeight)) } : {}),
  };
}
