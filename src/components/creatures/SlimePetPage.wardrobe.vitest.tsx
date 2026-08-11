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

    fireEvent.click(
      screen.getByRole("button", { name: "퍼플 슬라임 효과 상세 보기" }),
    );
    const details = screen.getByRole("region", {
      name: "퍼플 슬라임 효과 상세",
    });
    expect(within(details).getByText("소품 추가 효과")).toBeTruthy();
    expect(
      within(details).getByText("레모네이드 · 걷기 보상 +1%"),
    ).toBeTruthy();
  });

  it("disables and grays the cookie action when no cookies are owned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(home({ ownedColors: ["blue"], ownedItemQuantities: {} })),
      ),
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
    // Account summary is aggregate-only; pet base copy lives in the card popover.
    expect(screen.getAllByText("펫 기본 효과").length).toBeGreaterThanOrEqual(1);
  });

  it("summarizes account-wide applied buffs without repeating every pet row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue", "purple"],
            equippedColors: ["purple"],
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    const heading = await screen.findByRole("heading", { name: "적용 중인 버프" });
    const section = heading.closest("section");
    expect(section).toBeTruthy();
    expect(within(section!).getByText("성장 속도")).toBeTruthy();
    expect(within(section!).getByText("과제 제출 보상")).toBeTruthy();
    expect(within(section!).getAllByText(/\+2%/).length).toBeGreaterThanOrEqual(2);
    // Aggregate summary should not re-list every pet name.
    expect(within(section!).queryByText("블루 슬라임")).toBeNull();
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
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/student/slimes/items/consume",
    );
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": expect.stringContaining(
            "slime-cookie-consume-blue",
          ),
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
    expect(
      screen.getByRole("progressbar", { name: /진행도 52%/ }),
    ).toBeTruthy();
    expect(
      document.querySelector(
        '[data-slime-color="blue"][data-slime-action="happy"]',
      ),
    ).toBeTruthy();
  });

    it("equips a claimed title from the wardrobe modal and renders only the authoritative reloaded state", async () => {
    const title = {
      key: "weekly-50k",
      label: "꾸준한 발걸음",
      imagePath: "/walking/titles/weekly-50k-pixel-512.png",
      effectKey: "growth_speed",
      buffBps: 100,
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(home({ ownedColors: ["blue"], claimedTitles: [title] })),
      )
      .mockImplementationOnce(() =>
        json({ color: "blue", equippedTitleKey: title.key }),
      )
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            claimedTitles: [title],
            equippedTitleByColor: { blue: title.key },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    fireEvent.click(within(modal).getByRole("tab", { name: "칭호" }));
    fireEvent.click(
      within(modal).getByRole("button", { name: `${title.label} 칭호 장착` }),
    );

    expect(
      await screen.findByText("블루 슬라임에게 칭호를 붙였어요: 꾸준한 발걸음"),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/titles/equip");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      color: "blue",
      titleKey: title.key,
    });
    expect(
      screen.getAllByText(title.label).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("clears an equipped title from the wardrobe modal and confirms the cleared state by reloading pets", async () => {
    const title = {
      key: "weekly-50k",
      label: "꾸준한 발걸음",
      imagePath: "/walking/titles/weekly-50k-pixel-512.png",
      effectKey: "growth_speed",
      buffBps: 100,
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            claimedTitles: [title],
            equippedTitleByColor: { blue: title.key },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({ color: "blue", equippedTitleKey: null }),
      )
      .mockImplementationOnce(() =>
        json(home({ ownedColors: ["blue"], claimedTitles: [title] })),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    fireEvent.click(within(modal).getByRole("tab", { name: "칭호" }));
    fireEvent.click(
      within(modal).getByRole("button", { name: `${title.label} 칭호 해제` }),
    );

    expect(
      await screen.findByText("블루 슬라임의 칭호를 해제했어요."),
    ).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      color: "blue",
      titleKey: null,
    });
  });


  it("surfaces worn-by-other wardrobe state and move action labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue", "green"],
            ownedItemKeys: ["grass-floor-background"],
            equippedItemKeys: ["grass-floor-background"],
            equippedItemsByColor: {
              blue: [],
              green: ["grass-floor-background"],
            },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    expect(
      within(modal).getByRole("button", { name: "잔디 바닥 여기로 옮기기" }),
    ).toBeTruthy();
    expect(within(modal).getByText(/그린 슬라임에/)).toBeTruthy();
    expect(within(modal).queryByText(/원$/)).toBeNull();
  });

  it("lists only owned wardrobe items and prioritizes equipped ones", async () => {
    const ownedFloor =
      SLIME_SHOP_CATALOG.find((item) => item.key === "grass-floor-background")!;
    const otherFloor =
      SLIME_SHOP_CATALOG.find(
        (item) =>
          item.category === "background" &&
          item.floor &&
          item.key !== ownedFloor.key,
      ) ?? ownedFloor;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: [ownedFloor.key, otherFloor.key],
            equippedItemKeys: [otherFloor.key],
            equippedItemsByColor: { blue: [otherFloor.key] },
          }),
        ),
      ),
    );
    render(<SlimePetPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    const tabs = within(modal).getByRole("tablist", { name: "꾸미기 분류" });
    for (const label of ["전체", "바닥", "탈것", "소품", "착장", "칭호"]) {
      expect(within(tabs).getByRole("tab", { name: label })).toBeTruthy();
    }

    fireEvent.click(within(tabs).getByRole("tab", { name: "전체" }));
    const search = within(modal).getByRole("searchbox", { name: "상품 검색" });
    fireEvent.change(search, { target: { value: ownedFloor.labelKo } });
    expect(within(modal).getByText(ownedFloor.labelKo)).toBeTruthy();
    expect(within(modal).queryByText(otherFloor.labelKo)).toBeNull();
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(within(tabs).getByRole("tab", { name: "바닥" }));

    const list = within(modal).getByRole("list", { name: "보유 아이템 목록" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards[0]?.textContent).toContain(otherFloor.labelKo);
    expect(
      within(modal).getByRole("button", { name: `${otherFloor.labelKo} 해제` }),
    ).toBeTruthy();
    expect(
      within(modal).getByRole("button", {
        name: `${otherFloor.labelKo} 외형 숨기기`,
      }),
    ).toBeTruthy();
    expect(
      within(modal).getByRole("button", { name: `${ownedFloor.labelKo} 장착` }),
    ).toBeTruthy();
  });

  it("shows hidden wardrobe state without price and toggles show label", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: ["grass-floor-background"],
            equippedItemKeys: ["grass-floor-background"],
            equippedItemsByColor: { blue: ["grass-floor-background"] },
            hiddenItemsByColor: { blue: ["grass-floor-background"] },
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          slimeColor: "blue",
          itemKey: "grass-floor-background",
          isHidden: false,
          equippedItemKeys: ["grass-floor-background"],
          equippedItemsByColor: { blue: ["grass-floor-background"] },
          hiddenItemKeys: [],
          hiddenItemsByColor: { blue: [] },
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
    expect(within(modal).getByText("외형 숨김 · 버프는 유지")).toBeTruthy();
    fireEvent.click(
      within(modal).getByRole("button", { name: "잔디 바닥 외형 보이기" }),
    );
    expect(
      await screen.findByText("잔디 바닥 외형을 다시 표시했어요."),
    ).toBeTruthy();
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
      .mockImplementationOnce(() =>
        json(home({ ownedColors: ["blue"], claimedTitles: [title] })),
      )
      .mockImplementationOnce(() => json({ error: "title_not_claimed" }, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 꾸미기" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "블루 슬라임 꾸미기",
    });
    fireEvent.click(within(modal).getByRole("tab", { name: "칭호" }));
    fireEvent.click(
      within(modal).getByRole("button", { name: `${title.label} 칭호 장착` }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "아직 받지 않은 칭호예요.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
