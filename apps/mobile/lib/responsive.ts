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

export function isPortraitTabletViewport(width: number, height: number) {
  return width >= layout.mobileBreakpoint && height >= width;
}
