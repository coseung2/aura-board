import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

const GRASS_FLOOR_KEY = "grass-floor-background";
const GRASS_FLOOR_LABEL = "잔디 바닥";
const COOKIE_KEY = "slime-cookie";
const COOKIE_LABEL = "쿠키";

describe("slime shop refunds", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers refund actions for an owned slime color and cosmetic, never for cookies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: [GRASS_FLOOR_KEY],
            equippedItemKeys: [GRASS_FLOOR_KEY],
            equippedItemsByColor: { blue: [GRASS_FLOOR_KEY] },
            ownedItemQuantities: { [COOKIE_KEY]: 2 },
          }),
        ),
      ),
    );

    render(<SlimePetPage initialSection="shop" />);

    const tabs = await screen.findByRole("tablist", { name: "상점 분류" });

    fireEvent.click(within(tabs).getByRole("tab", { name: "캐릭터" }));
    expect(
      await screen.findByRole("button", { name: "블루 슬라임 환불" }),
    ).toBeTruthy();

    fireEvent.click(within(tabs).getByRole("tab", { name: "바닥" }));
    expect(
      await screen.findByRole("button", { name: `${GRASS_FLOOR_LABEL} 환불` }),
    ).toBeTruthy();

    fireEvent.click(within(tabs).getByRole("tab", { name: "먹이" }));
    expect(await screen.findByText(COOKIE_LABEL)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: `${COOKIE_LABEL} 환불` }),
    ).toBeNull();
  });

  it("refunds an owned slime color through POST /api/student/slimes/refund", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(home({ ownedColors: ["blue"], balance: 350 })),
      )
      .mockImplementationOnce(() =>
        json({ refundedColor: "blue", balance: 150, representativeColor: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SlimePetPage initialSection="shop" />);

    const tabs = await screen.findByRole("tablist", { name: "상점 분류" });
    fireEvent.click(within(tabs).getByRole("tab", { name: "캐릭터" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "블루 슬라임 환불" }),
    );

    expect(await screen.findByText("블루 슬라임을(를) 환불했어요.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/student/slimes/refund");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      color: "blue",
    });
    expect(
      screen.queryByRole("button", { name: "블루 슬라임 환불" }),
    ).toBeNull();
  });

  it("refunds an owned cosmetic through POST /api/student/slimes/items/refund", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        json(
          home({
            ownedColors: ["blue"],
            ownedItemKeys: [GRASS_FLOOR_KEY],
            equippedItemKeys: [GRASS_FLOOR_KEY],
            equippedItemsByColor: { blue: [GRASS_FLOOR_KEY] },
            balance: 350,
          }),
        ),
      )
      .mockImplementationOnce(() =>
        json({ refundedItemKey: GRASS_FLOOR_KEY, balance: 250 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SlimePetPage initialSection="shop" />);

    const tabs = await screen.findByRole("tablist", { name: "상점 분류" });
    fireEvent.click(within(tabs).getByRole("tab", { name: "바닥" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `${GRASS_FLOOR_LABEL} 환불` }),
    );

    expect(
      await screen.findByText(`${GRASS_FLOOR_LABEL}을(를) 환불했어요.`),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/student/slimes/items/refund",
    );
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      itemKey: GRASS_FLOOR_KEY,
    });
    expect(
      screen.queryByRole("button", {
        name: `${GRASS_FLOOR_LABEL} 환불`,
      }),
    ).toBeNull();
  });
});
