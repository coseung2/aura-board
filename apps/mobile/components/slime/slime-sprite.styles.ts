import { StyleSheet } from "react-native";
import { layers } from "../../theme/tokens";

export const styles = StyleSheet.create({
  viewport: {
    position: "relative",
    overflow: "hidden",
  },
  layer: {
    position: "absolute",
  },
  // Keep the background in the normal sibling stack. A negative z-index can
  // place it behind the clipped viewport on Android; render order keeps later
  // floor and character layers above it.
  backgroundLayer: { zIndex: layers.spriteFloor },
  floorUnder: { zIndex: layers.spriteFloor },
  itemLayer: { zIndex: layers.spriteItem },
  propLayer: { zIndex: layers.spriteProp },
  frameViewport: { overflow: "hidden" },
});
