import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { isPortraitTabletViewport, isWideGameViewport } from "./responsive";

describe("native responsive viewport helpers", () => {
  it("splits wide landscape games but keeps large-font and narrow layouts scrollable", () => {
    expect(isWideGameViewport(1280, 800)).toBe(true);
    expect(isWideGameViewport(932, 430)).toBe(true);
    expect(isWideGameViewport(800, 1280)).toBe(false);
    expect(isWideGameViewport(600, 400)).toBe(false);
    expect(isWideGameViewport(1280, 800, 2)).toBe(false);
    expect(isWideGameViewport(1366, 1024, 1.5)).toBe(false);
  });
  it("selects portrait tablet layouts at and above the mobile breakpoint", () => {
    expect(isPortraitTabletViewport(640, 960)).toBe(true);
    expect(isPortraitTabletViewport(800, 1280)).toBe(true);
  });

  it("keeps phone and landscape tablet layouts unchanged", () => {
    expect(isPortraitTabletViewport(430, 932)).toBe(false);
    expect(isPortraitTabletViewport(1280, 800)).toBe(false);
  });
});
