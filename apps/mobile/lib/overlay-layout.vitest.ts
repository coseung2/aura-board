import { describe, expect, it } from "vitest";
import { fitOverlaySurface, MODAL_ORIENTATIONS, overlayFrameInsets } from "./overlay-layout";

const insets = { top: 24, right: 24, bottom: 34, left: 24 };
const viewports = [[430, 932], [932, 430], [800, 1280], [1280, 800], [1366, 1024], [320, 480]];

describe("adaptive overlay geometry", () => {
  it("supports both landscape rotations as well as portrait", () => {
    expect(MODAL_ORIENTATIONS).toEqual(expect.arrayContaining(["portrait", "landscape-left", "landscape-right"]));
  });

  it.each(viewports)("keeps surfaces within %i×%i, with or without keyboard", (width, height) => {
    for (const keyboardHeight of [0, Math.min(height * 0.6, 320)]) {
      for (const alignment of ["center", "bottom", "right"] as const) {
        const padding = overlayFrameInsets({ width, height }, insets, alignment);
        const frame = {
          width: width - padding.paddingLeft - padding.paddingRight,
          height: Math.max(0, height - padding.paddingTop - padding.paddingBottom - keyboardHeight),
        };
        const sheet = fitOverlaySurface(frame, { minHeight: 264, maxHeight: "89%", height: "89%" });
        expect(sheet.width).toBeLessThanOrEqual(Math.min(720, frame.width));
        expect(sheet.maxHeight).toBeLessThanOrEqual(frame.height);
        expect(sheet.minHeight).toBeLessThanOrEqual(sheet.maxHeight as number);
        expect(sheet.height).toBeCloseTo(frame.height * 0.89);
        expect(padding.paddingLeft).toBeGreaterThanOrEqual(insets.left);
        expect(padding.paddingRight).toBeGreaterThanOrEqual(insets.right);
      }
    }
  });

  it("honors narrow dialogs and clamps fixed drawers in split windows", () => {
    expect(fitOverlaySurface({ width: 1200, height: 700 }, { maxWidth: 400 }).width).toBe(400);
    expect(fitOverlaySurface({ width: 280, height: 300 }, { width: 420, height: "100%" })).toMatchObject({ width: 280, height: 300 });
  });

  it("does not force a minimum beyond a collapsed frame", () => {
    expect(fitOverlaySurface({ width: 0, height: 0 }, { minHeight: 264 })).toMatchObject({ width: 0, minHeight: 0, maxHeight: 0 });
  });
});
