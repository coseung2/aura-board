import {
  Platform,
  type DimensionValue,
  type ViewStyle,
} from "react-native";
import { layout, responsive } from "../theme/tokens";

type WebSafeWidthOptions = {
  enabled?: boolean;
  inset: number;
  maxWidth?: number;
};

export function webSafeWidthStyle(
  viewportWidth: number,
  { enabled = true, inset, maxWidth }: WebSafeWidthOptions,
): ViewStyle | undefined {
  if (!enabled || Platform.OS !== "web") return undefined;

  const availableWidth = Math.max(
    responsive.minSafeWidth,
    viewportWidth - inset,
  );
  const width = maxWidth === undefined
    ? availableWidth
    : Math.min(maxWidth, availableWidth);

  return { width: width as DimensionValue } as ViewStyle;
}

/** Window width, not device type: landscape and split-screen are first class. */
export function isWideViewport(width: number) {
  return width >= layout.mobileBreakpoint;
}

/** Large fonts fall back to a vertical, scrollable game rather than tiny columns. */
export function isWideGameViewport(width: number, height: number, fontScale = 1) {
  return width > height && Math.min(width, layout.readableMaxWidth) / Math.max(1, fontScale) >= layout.authTwoPaneBreakpoint;
}
