import { useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { overlayFrameInsets, type OverlayAlignment, type OverlayFrame } from "../lib/overlay-layout";

/** Measure inside keyboard avoidance, so percentages use the visible frame. */
export function useOverlayFrame(alignment: OverlayAlignment) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const padding = overlayFrameInsets(window, insets, alignment);
  const available = {
    width: Math.max(0, window.width - padding.paddingLeft - padding.paddingRight),
    height: Math.max(0, window.height - padding.paddingTop - padding.paddingBottom),
  };
  const key = `${available.width}:${available.height}`;
  const [measured, setMeasured] = useState<(OverlayFrame & { key: string }) | null>(null);
  const frame = measured?.key === key ? {
    width: Math.min(available.width, measured.width),
    height: Math.min(available.height, measured.height),
  } : available;
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setMeasured((current) => current?.key === key && current.width === layout.width && current.height === layout.height
      ? current : { key, width: layout.width, height: layout.height });
  };
  return { frame, padding, insets, onLayout };
}
