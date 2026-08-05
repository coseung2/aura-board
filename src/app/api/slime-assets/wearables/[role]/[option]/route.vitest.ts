import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/slime-assets/wearables/:role/:option", () => {
  it("serves a cacheable remote manifest for an approved wearable", async () => {
    const response = await GET(
      new Request("https://example.test/api/slime-assets/wearables/headwear/sprout-terrarium-dome-hat"),
      {
        params: Promise.resolve({
          role: "headwear",
          option: "sprout-terrarium-dome-hat",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    const body = await response.json();
    expect(body.asset).toMatchObject({
      version: 1,
      key: "headwear/sprout-terrarium-dome-hat",
      role: "headwear",
      option: "sprout-terrarium-dome-hat",
      imageScale: 4,
    });
    expect(body.asset.sheets.idle.url).toContain(
      "/composition/headwear/sprout-terrarium-dome-hat/idle/sheet.png",
    );
    expect(body.asset.timelines.idle.anchors.length).toBeGreaterThan(0);
  });

  it("does not expose unapproved imported art", async () => {
    const response = await GET(
      new Request("https://example.test/api/slime-assets/wearables/headwear/acorn-leaf-beret"),
      {
        params: Promise.resolve({ role: "headwear", option: "acorn-leaf-beret" }),
      },
    );
    expect(response.status).toBe(404);
  });
});
