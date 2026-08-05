import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  getSlimeHome: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/pets/service", () => ({
  getSlimeHome: mocks.getSlimeHome,
  isSlimeServiceError: () => false,
}));

import { GET } from "./route";

describe("GET /api/student/slimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.getSlimeHome.mockResolvedValue({
      balance: 200,
      currency: { unitLabel: "원" },
      ownedColors: ["blue"],
      catalog: [],
      ownedItemKeys: [
        "slime-headwear-straw-hat",
        "slime-headwear-sprout-terrarium-dome-hat",
      ],
      ownedItemQuantities: {
        "slime-headwear-straw-hat": 1,
        "slime-headwear-sprout-terrarium-dome-hat": 1,
      },
      equippedItemKeys: ["slime-headwear-sprout-terrarium-dome-hat"],
      equippedItemsByColor: {
        blue: ["slime-headwear-sprout-terrarium-dome-hat"],
      },
      hiddenItemKeys: ["slime-headwear-sprout-terrarium-dome-hat"],
      hiddenItemsByColor: {
        blue: ["slime-headwear-sprout-terrarium-dome-hat"],
      },
      shopCatalog: [
        {
          key: "slime-headwear-straw-hat",
          category: "wearable",
          floor: null,
          labelKo: "밀짚모자",
          price: 100,
          spritePath: "/straw-hat.png",
        },
        {
          key: "slime-headwear-sprout-terrarium-dome-hat",
          category: "wearable",
          floor: null,
          labelKo: "새싹 테라리움 돔 모자",
          price: 100,
          spritePath: "/terrarium.png",
        },
      ],
    });
  });

  it("requires student auth", async () => {
    mocks.getCurrentStudent.mockResolvedValue(null);
    const response = await GET(new Request("https://example.test/api/student/slimes"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("returns the authenticated student's private wallet snapshot", async () => {
    const response = await GET(new Request("https://example.test/api/student/slimes"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(mocks.getSlimeHome).toHaveBeenCalledWith({ id: "student-1", classroomId: "classroom-1" });
    expect(await response.json()).toMatchObject({ balance: 200, ownedColors: ["blue"] });
  });

  it("hides late wearable rows from an old bearer client", async () => {
    const response = await GET(new Request("https://example.test/api/student/slimes", {
      headers: { authorization: "Bearer old-mobile-token" },
    }));
    const body = await response.json();
    expect(body.shopCatalog.map((item: { key: string }) => item.key)).toEqual([
      "slime-headwear-straw-hat",
    ]);
    expect(body.ownedItemKeys).toEqual(["slime-headwear-straw-hat"]);
    expect(body.ownedItemQuantities).toEqual({ "slime-headwear-straw-hat": 1 });
    expect(body.equippedItemKeys).toEqual([]);
    expect(body.equippedItemsByColor).toEqual({ blue: [] });
    expect(body.hiddenItemKeys).toEqual([]);
    expect(body.hiddenItemsByColor).toEqual({ blue: [] });
  });

  it("keeps late wearable rows for a remote-manifest capable app", async () => {
    const response = await GET(new Request("https://example.test/api/student/slimes", {
      headers: {
        authorization: "Bearer current-mobile-token",
        "x-aura-mobile-capabilities": "slime-wearable-assets-v1",
      },
    }));
    const body = await response.json();
    expect(body.shopCatalog).toHaveLength(2);
    expect(body.ownedItemKeys).toHaveLength(2);
    expect(body.equippedItemKeys).toEqual([
      "slime-headwear-sprout-terrarium-dome-hat",
    ]);
  });
});
