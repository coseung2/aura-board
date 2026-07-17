import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminShopPage from "./page";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  transactionGroupBy: vi.fn(),
  transactionFindMany: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/TopNav", () => ({ TopNav: () => null }));
vi.mock("@/components/admin/AdminFeatureHeader", () => ({
  AdminFeatureHeader: () => null,
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminUser: mocks.requireAdminUser,
  AdminForbidden: () => <p>접근 권한이 없습니다.</p>,
}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: {
      groupBy: mocks.transactionGroupBy,
      findMany: mocks.transactionFindMany,
    },
  },
}));

vi.mock("@/lib/creatures/catalog", () => ({
  CREATURE_LINES: [
    {
      key: "terramote",
      affinity: "earth",
      nameKo: "테라모트",
      randomEggWeight: 3,
      affinityEggWeight: 1,
      stages: [],
    },
  ],
  CREATURE_RANDOM_EGG_WEIGHTS: [{ lineKey: "terramote", weight: 3 }],
  CREATURE_SHOP_PRODUCTS: [
    {
      key: "egg-random-01",
      kind: "random-egg",
      labelKo: "두근두근 랜덤 알",
      descriptionKo: "랜덤 알",
      price: 150,
      effect: { type: "random-egg", weights: [{ lineKey: "terramote", weight: 3 }] },
      visible: true,
    },
    {
      key: "egg-earth-01",
      kind: "affinity-egg",
      labelKo: "대지 알",
      descriptionKo: "대지 전용 알",
      price: 100,
      effect: { type: "affinity-egg", affinity: "earth" },
      visible: true,
    },
    {
      key: "food-dew-01",
      kind: "food",
      labelKo: "이슬 사탕",
      descriptionKo: "먹이",
      price: 30,
      effect: { type: "food", progressPoints: 1, nourishment: 1 },
      visible: true,
    },
  ],
}));

describe("AdminShopPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ authorized: true });
    mocks.transactionGroupBy.mockResolvedValue([
      {
        type: "creature_egg_purchase",
        _count: { _all: 2 },
        _sum: { amount: 250 },
      },
      {
        type: "creature_item_purchase",
        _count: { _all: 1 },
        _sum: { amount: 30 },
      },
    ]);
    mocks.transactionFindMany.mockResolvedValue([
      {
        id: "purchase-1",
        type: "creature_egg_purchase",
        amount: 150,
        balanceAfter: 850,
        note: "creature-egg-purchase:egg-random-01",
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
        account: {
          student: { name: "가온", number: 3 },
          classroom: {
            name: "햇살반",
            teacher: { name: "이선생", email: "teacher@example.com" },
          },
        },
      },
    ]);
  });

  it("renders the catalog, purchase totals, and recent purchase context", async () => {
    render(await AdminShopPage());

    expect(mocks.requireAdminUser).toHaveBeenCalledWith("/admin/shop");
    expect(mocks.transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    expect(screen.getByRole("heading", { name: "상품 카탈로그" })).toBeTruthy();
    expect(screen.getAllByText("두근두근 랜덤 알").length).toBeGreaterThan(0);
    expect(screen.getByText("전역 랜덤")).toBeTruthy();
    expect(screen.getAllByText("알 구매").length).toBeGreaterThan(0);
    expect(screen.getByText("가온 (3번)")).toBeTruthy();
    expect(screen.getByText("햇살반")).toBeTruthy();
    expect(screen.getByText("creature-egg-purchase:egg-random-01")).toBeTruthy();
  });

  it("returns the forbidden view without touching purchase data", async () => {
    mocks.requireAdminUser.mockResolvedValue({ authorized: false });

    render(await AdminShopPage());

    expect(screen.getByText("접근 권한이 없습니다.")).toBeTruthy();
    expect(mocks.transactionGroupBy).not.toHaveBeenCalled();
    expect(mocks.transactionFindMany).not.toHaveBeenCalled();
  });
});
