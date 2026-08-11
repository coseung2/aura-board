import { describe, expect, it } from "vitest";

import { renderMobileSlimeRegistry } from "../../../scripts/slime-asset-mobile-registry-renderer.mjs";

describe("mobile slime registry renderer", () => {
  it("preserves runtime fields and emits readable generated source", () => {
    const output = renderMobileSlimeRegistry(
      [
        {
          key: "baby-blue-idle",
          evolution: "baby",
          color: "blue",
          action: "idle",
          metadata: { frameWidth: 16, frames: [{ x: 0, y: 0 }] },
        },
      ],
      [{ key: "blue-crown", differingPixels: 42 }],
      [
        {
          key: "baby-blue",
          evolution: "baby",
          color: "blue",
          metadata: { frameWidth: 16 },
        },
      ],
      { sharedPuddle: { key: "shared-puddle", frameCount: 3 } },
      {
        actions: ["idle"],
        colors: ["blue"],
        evolutions: ["baby"],
        playbackByAction: { idle: "loop" },
      },
    );

    expect(output).toContain('sheet: require("../assets/slimes/baby-blue-idle/sheet.png")');
    expect(output).toContain('overlay: require("../assets/slimes/overlays/blue-crown/overlay.png")');
    expect(output).toContain('"source": "../assets/slimes/shared/grass-floor.png"');
    expect(output).toContain('image: require("../assets/slimes/shared/water-puddle/sheet.png")');
    expect(output).toContain('"frameWidth": 16');
    expect(Math.max(...output.split("\n").map((line) => line.length))).toBeLessThanOrEqual(300);
    expect(output.endsWith("\n")).toBe(true);
  });
});
