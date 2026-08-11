import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SLIME_CATALOG, SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
import type { SlimeShopItem } from "@/lib/pets/types";
import { SlimePetPage } from "./SlimePetPage";

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function home(overrides: Record<string, unknown> = {}) {
  return {
    balance: 350,
    currency: { unitLabel: "원" },
    ownedColors: [],
    catalog: SLIME_CATALOG,
    ownedItemKeys: [],
    shopCatalog: SLIME_SHOP_CATALOG,
    ...overrides,
  };
}

const BASEBALL_ITEM =
  SLIME_SHOP_CATALOG.find((item) => item.key === "slime-ball-baseball") ??
  ({
    key: "slime-ball-baseball",
    category: "prop",
    floor: null,
    labelKo: "야구공",
    price: 100,
    spritePath:
      "/creatures/slimes/official/props/ball/baseball/blue/slime-blue-baseball-hit.gif",
  } as unknown as SlimeShopItem);

const SCENE_BACKGROUND_ITEM: SlimeShopItem = {
  key: "shooting-star-night-sky-background",
  category: "background",
  floor: null,
  labelKo: "별똥별 밤하늘",
  price: 100,
  spritePath: "/creatures/slimes/shop/shooting-star-night-sky.gif",
};

describe("SlimePetPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the accessory set section and keeps individual slime effects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ ownedColors: ["blue"] }))),
    );
    render(<SlimePetPage />);

    expect(await screen.findByRole("button", { name: "블루 슬라임 대표 펫" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "소품 세트" })).toBeNull();
    expect(screen.queryByText("적용 중인 버프")).toBeTruthy();
    expect(screen.getAllByText("블루 슬라임").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "블루 슬라임 대표 펫" }),
    ).toBeTruthy();
    expect(screen.getAllByLabelText("빈 슬라임 자리")).toHaveLength(4);
    expect(screen.queryByText("500원 구매")).toBeNull();
  });


  it("renders pet cards at integer renderer scale without CSS transform stretch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ ownedColors: ["blue"] }))),
    );
    render(<SlimePetPage />);
    const preview = await screen.findByRole("img", {
      name: "블루 슬라임 미리보기",
    });
    expect(preview.getAttribute("data-renderer-scale")).toBe("2");
    expect(preview.getAttribute("data-scene-width")).toBeTruthy();
    expect(preview.getAttribute("data-scene-height")).toBeTruthy();
    // Slot sizing comes from the renderer inline dimensions, not CSS scale.
    expect(preview.getAttribute("style") || "").toMatch(/width:/);
  });

it("renders deterministic stage growth percentages as accessible progress bars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue", "green"],
            growthByColor: {
              blue: {
                stage: 1,
                growthSeconds: 5 * 24 * 60 * 60,
                growthRemainderBps: 0,
                growthAppliedSpeedBps: 0,
                nextStage: 2,
                remainingSeconds: 5 * 24 * 60 * 60,
                remainingMinutes: 5 * 24 * 60,
              },
              green: {
                stage: 3,
                growthSeconds: 1,
                growthRemainderBps: 0,
                growthAppliedSpeedBps: 0,
                nextStage: null,
                remainingSeconds: 0,
                remainingMinutes: 0,
              },
            },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    const blueMeter = await screen.findByRole("progressbar", {
      name: "블루 슬라임 성장 1단계 진행도 50%",
    });
    expect(blueMeter.getAttribute("aria-valuemin")).toBe("0");
    expect(blueMeter.getAttribute("aria-valuemax")).toBe("100");
    expect(blueMeter.getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("50%")).toBeTruthy();

    const growthDetailTrigger = screen.getByRole("button", {
      name: "블루 슬라임 성장 시간 비교 보기",
    });
    fireEvent.mouseEnter(growthDetailTrigger);
    const comparison = screen.getByRole("region", {
      name: "블루 슬라임 성장 시간 비교",
    });
    expect(within(comparison).getByText("성장 속도 +2% 적용 중")).toBeTruthy();
    expect(within(comparison).getByText("버프 없음 120시간")).toBeTruthy();
    expect(within(comparison).getByText("적용 후 117.6시간")).toBeTruthy();

    const greenMeter = screen.getByRole("progressbar", {
      name: "그린 슬라임 성장 3단계 진행도 100%",
    });
    expect(greenMeter.getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.queryByText(/남은 시간/)).toBeNull();
  });

  it("renders the shop inline with semantic tabs and filters products", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home())),
    );
    render(<SlimePetPage initialSection="shop" />);

    const drawer = await screen.findByRole("region", { name: "슬라임 상점" });
    expect(screen.queryByRole("dialog", { name: "슬라임 상점" })).toBeNull();

    const filters = within(drawer).getByRole("tablist", { name: "상점 분류" });
    expect(within(filters).getAllByRole("tab")).toHaveLength(8);
    for (const label of ["전체", "캐릭터", "배경", "바닥", "탈것", "먹이", "소품", "착장"]) {
      expect(within(filters).getByRole("tab", { name: label })).toBeTruthy();
    }
    fireEvent.click(within(filters).getByRole("tab", { name: "캐릭터" }));
    expect(
      within(drawer).getByRole("button", { name: "그린 슬라임 구매" }),
    ).toBeTruthy();

    // Desktop shop cards are media-first with integer renderer scale 2.
    const characterPreview = within(drawer).getByRole("img", {
      name: "그린 슬라임 미리보기",
    });
    expect(characterPreview.getAttribute("data-renderer-scale")).toBe("2");
    expect(characterPreview.closest("li")?.className || "").toMatch(
      /shopProductCard|shopItem/,
    );
    expect(
      characterPreview.closest("[class*='shopMedia'], [class*='shopImageFrame']"),
    ).toBeTruthy();
    expect(within(drawer).getByText("독서 보상 +2%")).toBeTruthy();
    expect(within(drawer).queryByText(/기본 효과/)).toBeNull();

    fireEvent.click(within(filters).getByRole("tab", { name: "바닥" }));
    expect(within(drawer).getByText("잔디 바닥")).toBeTruthy();
    expect(within(drawer).queryByText("레모네이드")).toBeNull();
    const floorPreview = within(drawer).getByRole("img", {
      name: "잔디 바닥 미리보기",
    });
    expect(floorPreview.getAttribute("data-renderer-scale")).toBe("2");
    expect(within(drawer).getByRole("button", { name: /잔디 바닥 구매/ })).toBeTruthy();

    // The trampoline is a vehicle now, so it leaves the floor tab entirely.
    expect(within(drawer).queryByText("트램펄린")).toBeNull();
    fireEvent.click(within(filters).getByRole("tab", { name: "탈것" }));
    expect(within(drawer).getByText("트램펄린")).toBeTruthy();
    expect(within(drawer).queryByText("잔디 바닥")).toBeNull();
    expect(
      within(drawer)
        .getByRole("img", { name: "트램펄린 미리보기" })
        .getAttribute("data-renderer-scale"),
    ).toBe("2");

    fireEvent.click(within(filters).getByRole("tab", { name: "배경" }));
    expect(within(drawer).getByText("별똥별 밤하늘")).toBeTruthy();
    // Buff text lives only on the preview chip (aria-hidden), not body copy.
    expect(within(drawer).queryByText("잔디 바닥")).toBeNull();
    const nightSky = within(drawer).getByRole("img", {
      name: "별똥별 밤하늘 미리보기",
    });
    expect(nightSky.getAttribute("data-background-sprite-path")).toBe(
      "/creatures/slimes/shop/shooting-star-night-sky.gif",
    );
    expect(nightSky.getAttribute("data-renderer-scale")).toBe("2");
  });

  it("shows each owned slime's stage-adjusted effect in the shop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue"],
            growthByColor: { blue: { stage: 2 } },
          }),
        ),
      ),
    );
    render(<SlimePetPage initialSection="shop" />);

    const shop = await screen.findByRole("region", { name: "슬라임 상점" });
    fireEvent.click(within(shop).getByRole("tab", { name: "캐릭터" }));
    expect(within(shop).getByText("성장 속도 +4%")).toBeTruthy();
    expect(within(shop).queryByText(/기본 효과/)).toBeNull();
  });

  it("dims owned non-food products in the shop", async () => {
    const grass = SLIME_SHOP_CATALOG.find(
      (item) => item.key === "grass-floor-background",
    );
    expect(grass).toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedItemKeys: [grass!.key],
            ownedItemQuantities: { [grass!.key]: 1 },
          }),
        ),
      ),
    );
    render(<SlimePetPage initialSection="shop" />);

    const shop = await screen.findByRole("region", { name: "슬라임 상점" });
    fireEvent.click(within(shop).getByRole("tab", { name: "바닥" }));

    const ownedCard = within(shop).getByRole("button", {
      name: `${grass!.labelKo} 보유 중`,
    });
    expect(ownedCard.className).toMatch(/shopItemOwned/);
    expect(ownedCard.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("dialog", { name: "슬라임 상점" })).toBeNull();
  });

  it("moves the active tab with roving arrow and Home/End focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home())),
    );
    render(<SlimePetPage initialSection="shop" />);

    const drawer = await screen.findByRole("region", { name: "슬라임 상점" });
    const tabs = within(drawer).getAllByRole("tab");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("0");

    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[1]!, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(document.activeElement).toBe(tabs.at(-1));
    expect(tabs.at(-1)?.getAttribute("aria-selected")).toBe("true");
  });

  it("hides the optional background category when the catalog has no scene background", async () => {
    const legacyCatalog = SLIME_SHOP_CATALOG.filter(
      (item) => !(item.category === "background" && item.floor === null),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ shopCatalog: legacyCatalog }))),
    );
    render(<SlimePetPage initialSection="shop" />);

    const shop = await screen.findByRole("region", { name: "슬라임 상점" });
    const tabs = within(shop).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "전체",
      "캐릭터",
      "바닥",
      "탈것",
      "먹이",
      "소품",
      "착장",
    ]);
  });

  it("groups prop results into Korean ball and drink sections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ shopCatalog: SLIME_SHOP_CATALOG }))),
    );
    render(<SlimePetPage initialSection="shop" />);

    const drawer = await screen.findByRole("region", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "소품" }));
    expect(within(drawer).getByRole("heading", { name: "공" })).toBeTruthy();
    expect(within(drawer).getByRole("heading", { name: "음료" })).toBeTruthy();
    expect(within(drawer).getByText("야구공")).toBeTruthy();
    expect(within(drawer).getByText("레모네이드")).toBeTruthy();
  });

  it("routes wearable products to outfit groups and composes their previews", async () => {
    const headwear = SLIME_SHOP_CATALOG.find(
      (item) => item.wearableRole === "headwear",
    );
    const blush = SLIME_SHOP_CATALOG.find(
      (item) => item.wearableRole === "blush",
    );
    const eyewear = SLIME_SHOP_CATALOG.find(
      (item) => item.wearableRole === "eyewear",
    );
    expect(headwear).toBeTruthy();
    expect(blush).toBeTruthy();
    expect(eyewear).toBeTruthy();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ shopCatalog: SLIME_SHOP_CATALOG }))),
    );
    render(<SlimePetPage initialSection="shop" />);

    const drawer = await screen.findByRole("region", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "착장" }));

    expect(
      within(drawer).getByRole("heading", { name: "볼터치" }),
    ).toBeTruthy();
    expect(within(drawer).getByRole("heading", { name: "안경" })).toBeTruthy();
    expect(within(drawer).getByRole("heading", { name: "모자" })).toBeTruthy();
    expect(within(drawer).queryByText("레모네이드")).toBeNull();

    const preview = within(drawer).getByRole("img", {
      name: `${headwear!.labelKo} 미리보기`,
    });
    expect(preview.getAttribute("data-item-sprite-path")).toBeNull();
    expect(preview.getAttribute("data-wearable-keys")).toContain(
      `headwear/${headwear!.wearableOption}`,
    );
    expect(preview.getAttribute("data-head-slot")).toBe(
      headwear!.wearableOption,
    );
    expect(preview.getAttribute("data-head-slot-source")).toBe("equipped");
  });

  it("renders independent wearable slots together with the equipped drink flavor", async () => {
    const drink = SLIME_SHOP_CATALOG.find(
      (item) => item.category === "drink" && item.animationKey === "lemonade",
    );
    const blush = SLIME_SHOP_CATALOG.find(
      (item) => item.wearableRole === "blush",
    );
    const eyewear = SLIME_SHOP_CATALOG.find(
      (item) => item.wearableRole === "eyewear",
    );
    const headwear = SLIME_SHOP_CATALOG.find(
      (item) => item.wearableRole === "headwear",
    );
    expect(drink).toBeTruthy();
    expect(blush).toBeTruthy();
    expect(eyewear).toBeTruthy();
    expect(headwear).toBeTruthy();

    const equipped = [blush!.key, eyewear!.key, headwear!.key, drink!.key];
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: equipped,
            equippedItemKeys: equipped,
            equippedItemsByColor: { blue: equipped },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    const preview = await screen.findByRole("img", {
      name: /블루 슬라임, .* 적용 미리보기/,
    });
    const wearableKeys = preview.getAttribute("data-wearable-keys") ?? "";
    expect(wearableKeys).toContain(`blush/${blush!.wearableOption}`);
    expect(wearableKeys).toContain(`eyewear/${eyewear!.wearableOption}`);
    expect(wearableKeys).toContain(`headwear/${headwear!.wearableOption}`);
    expect(wearableKeys).toContain(`drink/${drink!.animationKey}`);
    expect(preview.getAttribute("data-slime-action")).toBe("drink");
  });

  it("renders an equipped ball with the matching slime-color looping GIF", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["purple"],
            shopCatalog: SLIME_SHOP_CATALOG,
            ownedItemKeys: [BASEBALL_ITEM.key],
            equippedItemKeys: [BASEBALL_ITEM.key],
            equippedItemsByColor: { purple: [BASEBALL_ITEM.key] },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    const preview = await screen.findByRole("img", {
      name: "퍼플 슬라임, 야구공 적용 미리보기",
    });
    expect(preview.getAttribute("data-item-sprite-path")).toBeNull();
    expect(preview.getAttribute("data-prop-kind")).toBe("ball");
    expect(preview.getAttribute("data-prop-action")).toBe(BASEBALL_ITEM.key);
    expect(preview.querySelector('[data-slime-ball-action-layer="true"] img')?.getAttribute("src")).toContain(
      "/baseball/purple/action-sheet.png",
    );
    expect(preview.querySelector('[data-slime-ball-prop-layer="true"] img')?.getAttribute("src")).toContain(
      "/baseball/purple/prop-sheet.png",
    );
  });

  it("composes a true scene background with a legacy floor for one slime color", async () => {
    const legacyFloor = SLIME_SHOP_CATALOG.find(
      (item) => item.key === "grass-floor-background",
    );
    expect(legacyFloor).toBeTruthy();
    const shopCatalog = [
      ...SLIME_SHOP_CATALOG.filter(
        (item) => item.key !== SCENE_BACKGROUND_ITEM.key,
      ),
      SCENE_BACKGROUND_ITEM,
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue"],
            shopCatalog,
            ownedItemKeys: [legacyFloor!.key, SCENE_BACKGROUND_ITEM.key],
            equippedItemKeys: [legacyFloor!.key, SCENE_BACKGROUND_ITEM.key],
            equippedItemsByColor: {
              blue: [legacyFloor!.key, SCENE_BACKGROUND_ITEM.key],
            },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    const preview = await screen.findByRole("img", {
      name: "블루 슬라임, 잔디 바닥, 별똥별 밤하늘 적용 미리보기",
    });
    // Host full-bleed owns the scene background; the character sprite stays clean.
    expect(preview.getAttribute("data-background-sprite-path")).toBeNull();
    expect(
      preview.querySelector(
        'img[src="/creatures/slimes/official/shared/grass-floor.png"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector(`img[src="${SCENE_BACKGROUND_ITEM.spritePath}"]`),
    ).toBeTruthy();
  });

  it("exposes directly addressable pet sections and marks Shop active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home())),
    );
    render(<SlimePetPage initialSection="shop" />);

    const navigation = screen.getByRole("navigation", { name: "펫 메뉴" });
    expect(
      within(navigation)
        .getByRole("link", { name: "내 펫" })
        .getAttribute("href"),
    ).toBe("/student/aura-pet?section=mine");
    expect(
      within(navigation)
        .getByRole("link", { name: "우리 반 펫" })
        .getAttribute("href"),
    ).toBe("/student/aura-pet?section=classroom");
    const shopLink = within(navigation).getByRole("link", { name: "상점" });
    expect(shopLink.getAttribute("href")).toBe(
      "/student/aura-pet?section=shop",
    );
    expect(shopLink.getAttribute("aria-current")).toBe("page");
  });

  it("offers a retry after the initial load fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() => json(home()));
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    expect(
      await screen.findByText("슬라임 정보를 불러오지 못했어요."),
    ).toBeTruthy();
    expect(screen.queryByText("표시할 슬라임이 없어요.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() =>
      expect(screen.queryByText("슬라임 정보를 불러오지 못했어요.")).toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("updates balance and ownership only after a successful shop purchase", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(home()))
      .mockImplementationOnce(() =>
        json(
          {
            ownedItemKey: "grass-floor-background",
            balance: 320,
            idempotent: false,
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage initialSection="shop" />);

    const drawer = await screen.findByRole("region", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "바닥" }));
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: "잔디 바닥 구매 미리보기",
      }),
    );

    // Buying now opens a confirmation step so the student can preview the item
    // on their own pets before any money moves.
    const confirmDialog = await screen.findByRole("dialog", { name: "잔디 바닥" });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "구매하기" }));

    await screen.findByText("잔디 바닥 구매를 완료했어요.");
    expect(within(drawer).getByText("잔디 바닥")).toBeTruthy();
    expect(
      within(drawer)
        .getByRole("button", { name: "잔디 바닥 보유 중" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/student/slimes/items/purchase",
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      itemKey: "grass-floor-background",
    });
  });

  it("dims an owned item in the shop", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            balance: 320,
            ownedColors: ["blue"],
            ownedItemKeys: ["grass-floor-background"],
            equippedItemKeys: ["grass-floor-background"],
            equippedItemsByColor: { blue: ["grass-floor-background"] },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage initialSection="shop" />);

    const drawer = await screen.findByRole("region", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "바닥" }));
    expect(
      within(drawer)
        .getByRole("button", { name: "잔디 바닥 보유 중" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

    it("toggles wardrobe item visibility without unequipping", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: ["grass-floor-background"],
            equippedItemKeys: ["grass-floor-background"],
            equippedItemsByColor: { blue: ["grass-floor-background"] },
            hiddenItemsByColor: { blue: [] },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          slimeColor: "blue",
          itemKey: "grass-floor-background",
          isHidden: true,
          equippedItemKeys: ["grass-floor-background"],
          equippedItemsByColor: { blue: ["grass-floor-background"] },
          hiddenItemKeys: ["grass-floor-background"],
          hiddenItemsByColor: { blue: ["grass-floor-background"] },
          idempotent: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    fireEvent.click(
      within(modal).getByRole("button", { name: "잔디 바닥 외형 숨기기" }),
    );
    expect(
      await screen.findByText("잔디 바닥 외형을 숨겼어요. 버프는 계속 적용돼요."),
    ).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/visibility");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      slimeColor: "blue",
      itemKey: "grass-floor-background",
      isHidden: true,
    });
  });

it("applies and removes an owned shop item through the equip route", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: ["grass-floor-background"],
            equippedItemKeys: [],
            equippedItemsByColor: { blue: [] },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          slimeColor: "blue",
          itemKey: "grass-floor-background",
          isEquipped: true,
          equippedItemKeys: ["grass-floor-background"],
          equippedItemsByColor: { blue: ["grass-floor-background"] },
          idempotent: false,
        }),
      )
      .mockImplementationOnce(() =>
        json({
          slimeColor: "blue",
          itemKey: "grass-floor-background",
          isEquipped: false,
          equippedItemKeys: [],
          equippedItemsByColor: { blue: [] },
          idempotent: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    const apply = within(drawer).getByRole("button", {
      name: "잔디 바닥 장착",
    });
    fireEvent.click(apply);
    await screen.findByText("잔디 바닥을(를) 블루 슬라임에 적용했어요.");
    expect(screen.queryByText("장착: 잔디 바닥")).toBeNull();
    expect(
      document.querySelector(
        '[data-slime-color="blue"][data-slime-action="idle"][data-equipped-floor="grass-floor"]',
      ),
    ).toBeTruthy();
    expect(
      document
        .querySelector('[data-slime-color="blue"]')
        ?.getAttribute("data-background-sprite-path"),
    ).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/equip");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      slimeColor: "blue",
      itemKey: "grass-floor-background",
      isEquipped: true,
    });

    fireEvent.click(
      within(drawer).getByRole("button", { name: "잔디 바닥 해제" }),
    );
    await screen.findByText("잔디 바닥을(를) 블루 슬라임에 해제했어요.");
    expect(screen.queryByText("장착한 아이템 없음")).toBeNull();
    expect(fetchMock.mock.calls[2][0]).toBe("/api/student/slimes/items/equip");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({
      slimeColor: "blue",
      itemKey: "grass-floor-background",
      isEquipped: false,
    });
  });

});
