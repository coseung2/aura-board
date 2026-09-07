import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  window: { width: 1280, height: 800, fontScale: 1.3, scale: 2 },
  insets: { top: 24, right: 48, bottom: 34, left: 12 },
}));
vi.mock("react-native", () => ({ useWindowDimensions: () => state.window }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => state.insets }));
import { useSafeWindowDimensions } from "../hooks/use-safe-window-dimensions";

describe("page dimensions", () => {
  it("subtracts all safe edges without losing font or pixel scaling", () => {
    expect(useSafeWindowDimensions()).toEqual({ width: 1220, height: 742, fontScale: 1.3, scale: 2 });
  });
  it("recomputes after rotation and resize instead of caching initial dimensions", () => {
    state.window = { width: 800, height: 1280, fontScale: 2, scale: 2 };
    state.insets = { top: 24, right: 0, bottom: 34, left: 0 };
    expect(useSafeWindowDimensions()).toEqual({ width: 800, height: 1222, fontScale: 2, scale: 2 });
  });
});
