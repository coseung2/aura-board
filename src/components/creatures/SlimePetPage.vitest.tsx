import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const BASEBALL_ITEM = SLIME_SHOP_CATALOG.find((item) => item.key === "slime-ball-baseball") ?? {
  key: "slime-ball-baseball",
  category: "prop",
  floor: null,
  labelKo: "야구공",
  price: 100,
  spritePath: "/creatures/slimes/official/props/ball/baseball/blue/slime-blue-baseball-hit.gif",
} as unknown as SlimeShopItem;

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
    vi.stubGlobal("fetch", vi.fn(() => json(home({ ownedColors: ["blue"] }))));
    render(<SlimePetPage />);

    expect(await screen.findByText("350 원")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "소품 세트" })).toBeNull();
    expect(screen.queryByText("효과 내역")).toBeTruthy();
    expect(screen.getAllByText("블루 슬라임").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "블루 슬라임 대표 펫" })).toBeTruthy();
    expect(screen.getAllByLabelText("빈 슬라임 자리")).toHaveLength(4);
    expect(screen.queryByText("500원 구매")).toBeNull();
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
    const comparison = screen.getByRole("region", { name: "블루 슬라임 성장 시간 비교" });
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

  it("opens the shop drawer with semantic tabs and filters products", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(home())));
    render(<SlimePetPage />);

    const trigger = await screen.findByRole("button", { name: "상점" });
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(drawer).getByRole("button", { name: "상점 닫기" }),
      ),
    );

    const filters = within(drawer).getByRole("tablist", { name: "상점 분류" });
    expect(within(filters).getAllByRole("tab")).toHaveLength(7);
    for (const label of ["전체", "캐릭터", "배경", "바닥", "먹이", "소품", "레벨업"]) {
      expect(within(filters).getByRole("tab", { name: label })).toBeTruthy();
    }
    expect(within(drawer).getByRole("button", { name: "그린 슬라임 구매" })).toBeTruthy();

    fireEvent.click(within(filters).getByRole("tab", { name: "전체" }));
    expect(within(drawer).getByText("물웅덩이 배경")).toBeTruthy();
    expect(within(drawer).getByText("트램펄린")).toBeTruthy();
    expect(within(drawer).getByText("레모네이드")).toBeTruthy();

    fireEvent.click(within(filters).getByRole("tab", { name: "바닥" }));
    expect(within(drawer).getByText("물웅덩이 배경")).toBeTruthy();
    expect(within(drawer).getByText("트램펄린")).toBeTruthy();
    expect(within(drawer).queryByText("레모네이드")).toBeNull();

    fireEvent.click(within(filters).getByRole("tab", { name: "배경" }));
    expect(within(drawer).getByText("별똥별 밤하늘")).toBeTruthy();
    expect(within(drawer).queryByText("물웅덩이 배경")).toBeNull();
    expect(
      within(drawer).getByRole("img", { name: "별똥별 밤하늘 미리보기" })
        .getAttribute("data-background-sprite-path"),
    ).toBe("/creatures/slimes/shop/shooting-star-night-sky.gif");
  });

  it("moves the active tab with roving arrow and Home/End focus", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(home())));
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "상점" }));
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    const tabs = within(drawer).getAllByRole("tab");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("tabindex")).toBe("0");

    tabs[1]!.focus();
    fireEvent.keyDown(tabs[1]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[2]!, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(document.activeElement).toBe(tabs.at(-1));
    expect(tabs.at(-1)?.getAttribute("aria-selected")).toBe("true");
  });

  it("groups prop results into Korean ball and drink sections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ shopCatalog: SLIME_SHOP_CATALOG }))),
    );
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "상점" }));
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "소품" }));
    expect(within(drawer).getByRole("heading", { name: "공" })).toBeTruthy();
    expect(within(drawer).getByRole("heading", { name: "음료" })).toBeTruthy();
    expect(within(drawer).getByText("야구공")).toBeTruthy();
    expect(within(drawer).getByText("레모네이드")).toBeTruthy();
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
    expect(preview.getAttribute("data-item-sprite-path")).toBe(
      "/creatures/slimes/official/props/ball/baseball/purple/slime-purple-baseball-hit.gif",
    );
    expect(preview.querySelector("img")?.getAttribute("src")).toContain(
      "/baseball/purple/slime-purple-baseball-hit.gif",
    );
  });

  it("composes a true scene background with a legacy floor for one slime color", async () => {
    const legacyFloor = SLIME_SHOP_CATALOG.find(
      (item) => item.key === "water-puddle-background",
    );
    expect(legacyFloor).toBeTruthy();
    const shopCatalog = [
      ...SLIME_SHOP_CATALOG.filter((item) => item.key !== SCENE_BACKGROUND_ITEM.key),
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
      name: "블루 슬라임, 물웅덩이 배경, 별똥별 밤하늘 적용 미리보기",
    });
    expect(preview.getAttribute("data-background-sprite-path")).toBe(
      SCENE_BACKGROUND_ITEM.spritePath,
    );
    expect(
      preview.querySelector(
        'img[src="/creatures/slimes/official/shared/water-puddle/sheet.png"]',
      ),
    ).toBeTruthy();
    expect(
      preview.querySelector(
        `img[src="${SCENE_BACKGROUND_ITEM.spritePath}"]`,
      ),
    ).toBeTruthy();
  });

  it("closes on Escape and restores focus to the shop trigger", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(home())));
    render(<SlimePetPage />);

    const trigger = await screen.findByRole("button", { name: "상점" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "슬라임 상점" });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "슬라임 상점" })).toBeNull());
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("button", { name: "상점 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "슬라임 상점" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps keyboard focus inside the open shop drawer", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(home())));
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "상점" }));
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    const buttons = within(drawer).getAllByRole("button");
    const first = buttons[0];
    const last = buttons.at(-1)!;

    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("offers a retry after the initial load fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(() => json(home()));
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    expect(await screen.findByText("슬라임 정보를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("표시할 슬라임이 없어요.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("350 원")).toBeTruthy();
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
            ownedItemKey: "water-puddle-background",
            balance: 320,
            idempotent: false,
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "상점" }));
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "전체" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "물웅덩이 배경 구매" }));

    await screen.findByText("물웅덩이 배경 구매를 완료했어요.");
    expect(screen.getByTestId("slime-wallet-balance").textContent).toContain("320");
    expect(within(drawer).getByText("보유 중")).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "물웅덩이 배경 환불" })).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/purchase");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      itemKey: "water-puddle-background",
    });
  });

  it("refunds an owned item, restores the balance, and removes its equipped state", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            balance: 320,
            ownedColors: ["blue"],
            ownedItemKeys: ["water-puddle-background"],
            equippedItemKeys: ["water-puddle-background"],
            equippedItemsByColor: { blue: ["water-puddle-background"] },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          refundedItemKey: "water-puddle-background",
          balance: 350,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "상점" }));
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "전체" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "물웅덩이 배경 환불" }));

    await screen.findByText("물웅덩이 배경을(를) 환불했어요.");
    expect(screen.getByTestId("slime-wallet-balance").textContent).toContain("350");
    expect(within(drawer).getByRole("button", { name: "물웅덩이 배경 구매" })).toBeTruthy();
    expect(screen.queryByText("장착한 아이템 없음")).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/refund");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      itemKey: "water-puddle-background",
    });
  });

  it("applies and removes an owned shop item through the equip route", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: ["water-puddle-background"],
            equippedItemKeys: [],
            equippedItemsByColor: { blue: [] },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          slimeColor: "blue",
          itemKey: "water-puddle-background",
          isEquipped: true,
          equippedItemKeys: ["water-puddle-background"],
          equippedItemsByColor: { blue: ["water-puddle-background"] },
          idempotent: false,
        }),
      )
      .mockImplementationOnce(() =>
        json({
          slimeColor: "blue",
          itemKey: "water-puddle-background",
          isEquipped: false,
          equippedItemKeys: [],
          equippedItemsByColor: { blue: [] },
          idempotent: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }));
    const drawer = await screen.findByRole("dialog", { name: "블루 슬라임 꾸미기" });
    const apply = within(drawer).getByRole("button", { name: "물웅덩이 배경 적용" });
    fireEvent.click(apply);
    await screen.findByText("물웅덩이 배경을(를) 블루 슬라임에 적용했어요.");
    expect(screen.queryByText("장착: 물웅덩이 배경")).toBeNull();
    expect(
      document.querySelector(
        '[data-slime-color="blue"][data-slime-action="floor-interaction"][data-equipped-floor="water-puddle"]',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-slime-color="blue"]')?.getAttribute(
        "data-background-sprite-path",
      ),
    ).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/equip");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      slimeColor: "blue",
      itemKey: "water-puddle-background",
      isEquipped: true,
    });

    fireEvent.click(within(drawer).getByRole("button", { name: "물웅덩이 배경 해제" }));
    await screen.findByText("물웅덩이 배경을(를) 블루 슬라임에 해제했어요.");
    expect(screen.queryByText("장착한 아이템 없음")).toBeNull();
    expect(fetchMock.mock.calls[2][0]).toBe("/api/student/slimes/items/equip");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({
      slimeColor: "blue",
      itemKey: "water-puddle-background",
      isEquipped: false,
    });
  });

  it("marks a composite animation for the owning slime color", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["purple"],
            ownedItemKeys: ["slime-blue-drink-lemonade"],
            equippedItemKeys: ["slime-blue-drink-lemonade"],
            equippedItemsByColor: { purple: ["slime-blue-drink-lemonade"] },
          }),
        ),
      ),
    );

    render(<SlimePetPage />);

    const preview = await screen.findByRole("img", {
      name: "퍼플 슬라임, 레모네이드 적용 미리보기",
    });
    expect(preview.getAttribute("data-slime-color")).toBe("purple");

    fireEvent.click(screen.getByRole("button", { name: "퍼플 슬라임 효과 상세 보기" }));
    const details = screen.getByRole("region", { name: "퍼플 슬라임 효과 상세" });
    expect(within(details).queryByText("소품 추가 효과")).toBeNull();
    expect(within(details).queryByText(/레모네이드/)).toBeNull();
  });

  it("disables and grays the cookie action when no cookies are owned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(home({ ownedColors: ["blue"], ownedItemQuantities: {} }))),
    );
    render(<SlimePetPage />);

    const feed = await screen.findByRole("button", {
      name: "블루 슬라임에게 쿠키 주기 (쿠키 없음)",
    });
    expect(feed).toHaveProperty("disabled", true);
    expect(feed.className).toContain("slimeActionButton");
  });

  it("shows the owned cookie count and groups the base effect in its detail panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: ["slime-cookie"],
            ownedItemQuantities: { "slime-cookie": 2 },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    const feed = await screen.findByRole("button", {
      name: "블루 슬라임에게 쿠키 주기 (보유 2개)",
    });
    expect(feed).toHaveProperty("disabled", false);
    expect(feed.textContent).toContain("2");

    fireEvent.click(
      screen.getByRole("button", { name: "블루 슬라임 효과 상세 보기" }),
    );
    const details = await screen.findByRole("region", {
      name: "블루 슬라임 효과 상세",
    });
    expect(within(details).getByText("펫 기본 효과")).toBeTruthy();
    expect(within(details).getByText("성장 속도 +2%")).toBeTruthy();
    expect(screen.getAllByText("펫 기본 효과").length).toBeGreaterThanOrEqual(2);
  });

  it("lists every owned slime buff even when only another slime is equipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(home({
          ownedColors: ["blue", "purple"],
          equippedColors: ["purple"],
        })),
      ),
    );
    render(<SlimePetPage />);

    const heading = await screen.findByRole("heading", { name: "효과 내역" });
    const section = heading.closest("section");
    expect(section).toBeTruthy();
    expect(within(section!).getByText("블루 슬라임")).toBeTruthy();
    expect(within(section!).getByText("성장 속도 +2%")).toBeTruthy();
    expect(within(section!).queryByRole("img")).toBeNull();
  });

  it("consumes a cookie with an idempotency key, updates growth, and plays happy", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: ["slime-cookie"],
            ownedItemQuantities: { "slime-cookie": 2 },
            growthByColor: {
              blue: {
                stage: 1,
                growthSeconds: 5 * 24 * 60 * 60,
                growthRemainderBps: 0,
                growthAppliedSpeedBps: 0,
                nextStage: 2,
                remainingSeconds: 5 * 24 * 60 * 60,
                remainingMinutes: 5 * 24,
              },
            },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          itemKey: "slime-cookie",
          remainingQuantity: 1,
          growth: {
            stage: 1,
            // +2% of the ten-day stage-one total = 0.2 day.
            growthSeconds: 5 * 24 * 60 * 60 + 0.2 * 24 * 60 * 60,
            growthRemainderBps: 0,
            growthAppliedSpeedBps: 0,
            nextStage: 2,
            remainingSeconds: 4.8 * 24 * 60 * 60,
            remainingMinutes: Math.ceil(4.8 * 24 * 60),
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "블루 슬라임에게 쿠키 주기 (보유 2개)",
      }),
    );

    await screen.findByText("블루 슬라임에게 쿠키를 먹였어요.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/consume");
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": expect.stringContaining("slime-cookie-consume-blue"),
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      itemKey: "slime-cookie",
      color: "blue",
    });
    expect(
      await screen.findByRole("button", {
        name: "블루 슬라임에게 쿠키 주기 (보유 1개)",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: /진행도 52%/ })).toBeTruthy();
    expect(
      document.querySelector('[data-slime-color="blue"][data-slime-action="happy"]'),
    ).toBeTruthy();
  });

  it("equips a claimed title and renders only the authoritative reloaded state", async () => {
    const title = {
      key: "weekly-50k",
      label: "꾸준한 발걸음",
      imagePath: "/walking/titles/weekly-50k-pixel-512.png",
      effectKey: "growth_speed",
      buffBps: 100,
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(home({ ownedColors: ["blue"], claimedTitles: [title] })))
      .mockImplementationOnce(() => json({ color: "blue", equippedTitleKey: title.key }))
      .mockImplementationOnce(() =>
        json(home({
          ownedColors: ["blue"],
          claimedTitles: [title],
          equippedTitleByColor: { blue: title.key },
        })),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    const wardrobe = await screen.findByRole("combobox", { name: "칭호" });
    expect(within(wardrobe).getByRole("option", { name: title.label })).toBeTruthy();
    fireEvent.change(wardrobe, { target: { value: title.key } });

    expect(await screen.findByText("블루 슬라임에게 칭호를 붙였어요: 꾸준한 발걸음")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/titles/equip");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ color: "blue", titleKey: title.key }),
    }));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/student/slimes");
    expect((screen.getByRole("combobox", { name: "칭호" }) as HTMLSelectElement).value).toBe(title.key);
    expect(screen.getAllByText(title.label).length).toBeGreaterThanOrEqual(2);
  });

  it("clears an equipped title and confirms the cleared state by reloading pets", async () => {
    const title = {
      key: "weekly-50k",
      label: "꾸준한 발걸음",
      imagePath: "/walking/titles/weekly-50k-pixel-512.png",
      effectKey: "growth_speed",
      buffBps: 100,
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(home({
        ownedColors: ["blue"],
        claimedTitles: [title],
        equippedTitleByColor: { blue: title.key },
      })))
      .mockImplementationOnce(() => json({ color: "blue", equippedTitleKey: null }))
      .mockImplementationOnce(() => json(home({ ownedColors: ["blue"], claimedTitles: [title] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.change(await screen.findByRole("combobox", { name: "칭호" }), {
      target: { value: "" },
    });

    expect(await screen.findByText("블루 슬라임의 칭호를 해제했어요.")).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      color: "blue",
      titleKey: null,
    });
    expect((screen.getByRole("combobox", { name: "칭호" }) as HTMLSelectElement).value).toBe("");
  });

  it("keeps the previous pet title when the equip mutation fails", async () => {
    const title = {
      key: "weekly-50k",
      label: "꾸준한 발걸음",
      imagePath: "/walking/titles/weekly-50k-pixel-512.png",
      effectKey: "growth_speed",
      buffBps: 100,
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => json(home({ ownedColors: ["blue"], claimedTitles: [title] })))
      .mockImplementationOnce(() => json({ error: "title_not_claimed" }, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.change(await screen.findByRole("combobox", { name: "칭호" }), {
      target: { value: title.key },
    });

    expect((await screen.findByRole("alert")).textContent).toContain("아직 받지 않은 칭호예요.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((screen.getByRole("combobox", { name: "칭호" }) as HTMLSelectElement).value).toBe("");
  });

});
