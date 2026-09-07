import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { isWideViewport, isWideGameViewport } from "./responsive";

describe("native responsive viewport helpers", () => {
  it("splits wide landscape games but keeps large-font and narrow layouts scrollable", () => {
    expect(isWideGameViewport(1280, 800)).toBe(true);
    expect(isWideGameViewport(932, 430)).toBe(true);
    expect(isWideGameViewport(800, 1280)).toBe(false);
    expect(isWideGameViewport(600, 400)).toBe(false);
    expect(isWideGameViewport(1280, 800, 2)).toBe(false);
    expect(isWideGameViewport(1366, 1024, 1.5)).toBe(false);
  });
  it("selects readable layouts in both tablet orientations", () => {
    expect(isWideViewport(640)).toBe(true);
    expect(isWideViewport(800)).toBe(true);
    expect(isWideViewport(1280)).toBe(true);
    expect(isWideViewport(1366)).toBe(true);
  });

  it("retains narrow layouts in phone and split-screen windows", () => {
    expect(isWideViewport(430)).toBe(false);
    expect(isWideViewport(639)).toBe(false);
  });
});
