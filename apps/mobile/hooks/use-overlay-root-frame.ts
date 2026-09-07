import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions, type View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { insetsWithinFrame, type OverlayRect } from "../lib/overlay-layout";

/** A route overlay can be shorter than a native Modal because a nav remains below it. */
export function useOverlayRootFrame() {
  const window = useWindowDimensions();
  const systemInsets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const key = `${window.width}:${window.height}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [measured, setMeasured] = useState<(OverlayRect & { key: string }) | null>(null);
  const measure = useCallback(() => {
    const measurementKey = keyRef.current;
    rootRef.current?.measureInWindow((x, y, width, height) => {
      if (!rootRef.current || keyRef.current !== measurementKey || width <= 0 || height <= 0) return;
      setMeasured((current) => current?.key === measurementKey && current.x === x && current.y === y && current.width === width && current.height === height
        ? current : { x, y, width, height, key: measurementKey });
    });
  }, []);
  useEffect(measure, [key, measure]);
  const frame = measured?.key === key ? measured : { x: 0, y: 0, width: window.width, height: window.height };
  return { rootRef, measure, frame, insets: insetsWithinFrame(window, systemInsets, frame) };
}
