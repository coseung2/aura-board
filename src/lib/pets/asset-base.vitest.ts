import { describe, expect, it } from "vitest";

import { SLIME_ASSET_ROOT, slimeAssetUrl } from "./asset-base";
import { SLIME_SHOP_CATALOG } from "./catalog";

describe("slime asset base", () => {
  it("serves from this origin when no CDN base is configured", () => {
    // The suite runs without NEXT_PUBLIC_SLIME_ASSET_BASE_URL, which is also the
    // local development default.
    expect(SLIME_ASSET_ROOT).toBe("/creatures/slimes");
    expect(slimeAssetUrl("shop/backgrounds/cloud-garden/x.gif")).toBe(
      "/creatures/slimes/shop/backgrounds/cloud-garden/x.gif",
    );
  });

  it("tolerates a leading slash in the logical path", () => {
    expect(slimeAssetUrl("/shop/x.gif")).toBe("/creatures/slimes/shop/x.gif");
  });

  it("rejects an empty path rather than emitting a directory URL", () => {
    expect(() => slimeAssetUrl("")).toThrow();
    expect(() => slimeAssetUrl("/")).toThrow();
  });
});

describe("mobile background payload", () => {
  /**
   * Mobile used to request the 256px variants, which summed to roughly 18 MB for
   * the shop and made the screen fail to finish loading. The 128px variants carry
   * the same frame counts and durations at about a fourteenth of the bytes.
   */
  it("points every animated background at the 128px variant", () => {
    const backgrounds = SLIME_SHOP_CATALOG.filter((item) => item.category === "background");
    expect(backgrounds.length).toBeGreaterThan(0);
    for (const item of backgrounds) {
      if (!item.mobileSpritePath?.endsWith(".gif")) continue;
      expect(item.mobileSpritePath, item.key).toContain("-6s-128.gif");
      expect(item.mobileSpritePath, item.key).not.toContain("-6s-256.gif");
    }
  });
});
