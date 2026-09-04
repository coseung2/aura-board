import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { isPortraitTabletViewport } from "./responsive";

describe("native responsive viewport helpers", () => {
  it("selects portrait tablet layouts at and above the mobile breakpoint", () => {
    expect(isPortraitTabletViewport(640, 960)).toBe(true);
    expect(isPortraitTabletViewport(800, 1280)).toBe(true);
  });

  it("keeps phone and landscape tablet layouts unchanged", () => {
    expect(isPortraitTabletViewport(430, 932)).toBe(false);
    expect(isPortraitTabletViewport(1280, 800)).toBe(false);
  });
});
