import { describe, expect, it } from "vitest";

import { slimeShopBallPreviewImagePath } from "../../../apps/mobile/lib/slime-shop-preview-performance";

describe("mobile slime shop ball preview performance", () => {
  it("uses the matching preview color and the high-density native GIF", () => {
    expect(
      slimeShopBallPreviewImagePath({
        key: "slime-ball-basketball",
        spritePath:
          "/creatures/slimes/official/props/ball/basketball/blue/slime-blue-basketball-hit-4x.gif",
        previewColor: "red",
      }),
    ).toBe(
      "/creatures/slimes/official/props/ball/basketball/red/slime-red-basketball-hit-4x.gif",
    );
  });

  it("preserves cache-busting query parameters on CDN paths", () => {
    expect(
      slimeShopBallPreviewImagePath({
        key: "slime-ball-soccer-ball",
        spritePath:
          "https://cdn.example.test/slimes/releases/r1/official/props/ball/soccer-ball/blue/slime-blue-soccer-ball-hit-4x.gif?v=2",
        previewColor: "green",
      }),
    ).toBe(
      "https://cdn.example.test/slimes/releases/r1/official/props/ball/soccer-ball/green/slime-green-soccer-ball-hit-4x.gif?v=2",
    );
  });

  it("prefers an explicit mobile preview supplied by the catalog", () => {
    expect(
      slimeShopBallPreviewImagePath({
        key: "slime-ball-baseball",
        spritePath: "/baseball-4x.gif",
        mobileSpritePath: "/baseball-mobile.gif",
        previewColor: "yellow",
      }),
    ).toBe("/baseball-mobile.gif");
  });

  it("keeps the provided source without guessing malformed paths", () => {
    expect(
      slimeShopBallPreviewImagePath({
        key: "slime-ball-black-ball",
        spritePath: "/legacy/slime-black-ball-hit-4x.gif",
      }),
    ).toBe("/legacy/slime-black-ball-hit-4x.gif");
  });

  it("does not replace the composed preview path for other categories", () => {
    expect(
      slimeShopBallPreviewImagePath({
        key: "slime-blue-drink-lemonade",
        spritePath: "/drink-4x.gif",
        previewColor: "blue",
      }),
    ).toBeUndefined();
  });
});
