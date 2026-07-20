import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SLIME_CATALOG, SLIME_SHOP_CATALOG } from "@/lib/pets/catalog";
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

describe("SlimePetPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the accessory set section and keeps individual slime effects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(home({ ownedColors: ["blue"] }))));
    render(<SlimePetPage />);

    expect(await screen.findByText("350 원")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "소품 세트" })).toBeNull();
    expect(screen.queryByText("효과 내역")).toBeTruthy();
    expect(screen.getAllByText("블루 슬라임").length).toBeGreaterThan(0);
  });

  it("opens the right shop drawer with exactly four filters and filters products", async () => {
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

    const filters = within(drawer).getByRole("group", { name: "상점 분류" });
    expect(within(filters).getAllByRole("button")).toHaveLength(4);
    for (const label of ["전체", "배경", "탈 것", "음료"]) {
      expect(within(filters).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(drawer).getByText("물웅덩이 배경")).toBeTruthy();
    expect(within(drawer).getByText("트램펄린")).toBeTruthy();
    expect(within(drawer).getByText("레모네이드")).toBeTruthy();

    fireEvent.click(within(filters).getByRole("button", { name: "배경" }));
    expect(within(drawer).getByText("물웅덩이 배경")).toBeTruthy();
    expect(within(drawer).queryByText("트램펄린")).toBeNull();
    expect(within(drawer).queryByText("레모네이드")).toBeNull();
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
    fireEvent.click(within(drawer).getByRole("button", { name: "물웅덩이 배경 구매" }));

    await screen.findByText("물웅덩이 배경 구매를 완료했어요.");
    expect(screen.getByTestId("slime-wallet-balance").textContent).toContain("320");
    const ownedButton = within(drawer).getByRole("button", {
      name: "물웅덩이 배경 적용",
    });
    expect(ownedButton.hasAttribute("disabled")).toBe(false);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/purchase");
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
            ownedItemKeys: ["water-puddle-background"],
            equippedItemKeys: [],
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({
          itemKey: "water-puddle-background",
          isEquipped: true,
          equippedItemKeys: ["water-puddle-background"],
          idempotent: false,
        }),
      )
      .mockImplementationOnce(() =>
        json({
          itemKey: "water-puddle-background",
          isEquipped: false,
          equippedItemKeys: [],
          idempotent: false,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<SlimePetPage />);

    fireEvent.click(await screen.findByRole("button", { name: "상점" }));
    const drawer = await screen.findByRole("dialog", { name: "슬라임 상점" });
    const apply = within(drawer).getByRole("button", { name: "물웅덩이 배경 적용" });
    fireEvent.click(apply);
    await screen.findByText("물웅덩이 배경을(를) 적용했어요.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/items/equip");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      itemKey: "water-puddle-background",
      isEquipped: true,
    });

    fireEvent.click(within(drawer).getByRole("button", { name: "물웅덩이 배경 적용 중, 해제" }));
    await screen.findByText("물웅덩이 배경을(를) 해제했어요.");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/student/slimes/items/equip");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({
      itemKey: "water-puddle-background",
      isEquipped: false,
    });
  });
});
