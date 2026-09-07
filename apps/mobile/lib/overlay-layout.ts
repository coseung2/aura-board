import type { ModalProps, ViewStyle } from "react-native";
import { composer, layout, spacing, tapMin } from "../theme/tokens";

export const MODAL_ORIENTATIONS: NonNullable<ModalProps["supportedOrientations"]> = [
  "portrait", "portrait-upside-down", "landscape-left", "landscape-right",
];

export type OverlayFrame = { width: number; height: number };
export type OverlayRect = OverlayFrame & { x: number; y: number };
export type SafeInsets = { top: number; right: number; bottom: number; left: number };
export type OverlayAlignment = "center" | "right" | "bottom";

/** Only apply the part of a system inset that overlaps this local root. */
export function insetsWithinFrame(window: OverlayFrame, insets: SafeInsets, rect: OverlayRect): SafeInsets {
  return {
    top: Math.max(0, insets.top - rect.y),
    left: Math.max(0, insets.left - rect.x),
    right: Math.max(0, insets.right - Math.max(0, window.width - rect.x - rect.width)),
    bottom: Math.max(0, insets.bottom - Math.max(0, window.height - rect.y - rect.height)),
  };
}

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

/** Stale pre-rotation anchors may position a menu, but can never size its window. */
export function anchoredOverlayLayout(
  frame: OverlayFrame,
  insets: SafeInsets,
  anchor: OverlayFrame & { x: number; y: number },
  actionHeight: number,
  centered = false,
) {
  const safeLeft = insets.left + spacing.lg;
  const safeTop = insets.top + spacing.lg;
  const safeWidth = Math.max(0, frame.width - safeLeft - insets.right - spacing.lg);
  const safeHeight = Math.max(0, frame.height - safeTop - insets.bottom - spacing.lg);
  const width = Math.min(safeWidth, Math.max(tapMin * 4 + spacing.sm, anchor.width));
  const actionsHeight = Math.min(safeHeight, Math.max(0, actionHeight));
  const previewBudget = Math.max(0, safeHeight - actionsHeight - spacing.sm);
  const requestedPreview = Math.max(0, Math.min(anchor.height, previewBudget));
  const previewHeight = requestedPreview >= tapMin ? requestedPreview : 0;
  const gap = previewHeight > 0 ? spacing.sm : 0;
  const height = previewHeight + gap + actionsHeight;
  return {
    width, height, previewHeight, actionsHeight, gap,
    left: Math.max(safeLeft, Math.min(anchor.x, safeLeft + safeWidth - width)),
    top: centered ? safeTop + (safeHeight - height) / 2
      : Math.max(safeTop, Math.min(anchor.y, safeTop + safeHeight - height)),
  };
}
