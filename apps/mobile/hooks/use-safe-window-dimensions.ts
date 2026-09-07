import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Page geometry after the screen/nav have consumed safe edges.
 * Native modal windows must instead measure their own overlay frame.
 */
export function useSafeWindowDimensions() {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return {
    ...window,
    width: Math.max(0, window.width - insets.left - insets.right),
    height: Math.max(0, window.height - insets.top - insets.bottom),
  };
}
