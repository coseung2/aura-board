import { describe, expect, it } from "vitest";
import { canReadMobileLayout, hasProductAccess, restrictedStudentPath, visibleProductTargets } from "./product-access";

const targets = [{ id: "home" }, { id: "feed" }, { id: "slime" }, { id: "more" }];
describe("server-owned mobile release access", () => {
  it("hides experimental navigation from missing or legacy cached capabilities", () => {
    expect(hasProductAccess(undefined, "play")).toBe(false);
    expect(visibleProductTargets(targets, {}).map((item) => item.id)).toEqual(["home", "slime", "more"]);
    expect(restrictedStudentPath("/feed/compose", {})).toBe(true);
    expect(restrictedStudentPath("/reading", {})).toBe(false);
  });
  it("uses only explicit true values, including old saved feed preferences", () => {
    expect(visibleProductTargets(targets, { productCapabilities: { feed: false } })).not.toContain(targets[1]);
    expect(visibleProductTargets(targets, { productCapabilities: { feed: true } })).toEqual(targets);
    expect(hasProductAccess({ productCapabilities: { play: true } }, "play")).toBe(true);
  });
  it("does not hydrate a cached development board outside the server allowlist", () => {
    const access = { availableLayouts: ["freeform", "columns", "dj-queue", "plant-roadmap"] };
    expect(canReadMobileLayout(access, "columns")).toBe(true);
    expect(canReadMobileLayout(access, "stream")).toBe(false);
    expect(canReadMobileLayout(access, "__proto__")).toBe(false);
    expect(canReadMobileLayout({}, "columns")).toBe(false);
  });
  it("supports pilot layouts without copying policy into the app", () => {
    const access = { availableLayouts: ["omok"], productCapabilities: { play: true, feed: true } };
    expect(canReadMobileLayout(access, "omok")).toBe(true);
    expect(restrictedStudentPath("/feed", access)).toBe(false);
  });
});
