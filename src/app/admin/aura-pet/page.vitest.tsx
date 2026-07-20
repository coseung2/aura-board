import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAuraPetPage from "./page";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  slimeCount: vi.fn(),
  slimeGroupBy: vi.fn(),
  slimeFindMany: vi.fn(),
  itemAggregate: vi.fn(),
}));

vi.mock("@/components/TopNav", () => ({ TopNav: () => null }));
vi.mock("@/components/admin/AdminFeatureHeader", () => ({ AdminFeatureHeader: () => null }));
vi.mock("@/components/creatures/SlimeCharacterSprite", () => ({
  SlimeCharacterSprite: ({ slime }: { slime: { nameKo: string } }) => <span>{slime.nameKo} 미리보기</span>,
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminUser: mocks.requireAdminUser,
  AdminForbidden: () => <p>접근 권한이 없습니다.</p>,
}));
vi.mock("@/lib/db", () => ({
  db: {
    studentSlime: {
      count: mocks.slimeCount,
      groupBy: mocks.slimeGroupBy,
      findMany: mocks.slimeFindMany,
    },
    studentCreatureItem: { aggregate: mocks.itemAggregate },
  },
}));

describe("AdminAuraPetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ authorized: true });
    mocks.slimeCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    mocks.slimeGroupBy
      .mockResolvedValueOnce([{ studentId: "student-1" }])
      .mockResolvedValueOnce([{ color: "blue", _count: { _all: 2 } }]);
    mocks.itemAggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { quantity: 2 } });
    mocks.slimeFindMany.mockResolvedValue([
      {
        id: "slime-1",
        color: "blue",
        isEquipped: true,
        isRepresentative: true,
        equippedItemKeys: ["slime-blue-drink-lemonade"],
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        student: {
          name: "가온",
          number: 3,
          classroom: { name: "햇살반", teacher: { name: "이선생", email: "teacher@example.com" } },
        },
      },
    ]);
  });

  it("renders the current slime, representative, and cosmetic state", async () => {
    render(await AdminAuraPetPage());

    expect(mocks.requireAdminUser).toHaveBeenCalledWith("/admin/aura-pet");
    expect(screen.getByRole("heading", { name: "펫 종류별 보유 현황" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "꾸미기 카탈로그" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "학생별 보유 펫" })).toBeTruthy();
    expect(screen.getAllByText("블루 슬라임").length).toBeGreaterThan(0);
    expect(screen.getByText("가온 (3번)")).toBeTruthy();
    expect(screen.getAllByText("레모네이드").length).toBeGreaterThan(0);
    expect(screen.getAllByText("대표").length).toBeGreaterThan(0);
  });

  it("shows the current pet empty state", async () => {
    mocks.slimeCount.mockReset();
    mocks.slimeCount.mockResolvedValue(0);
    mocks.slimeGroupBy.mockReset();
    mocks.slimeGroupBy.mockResolvedValue([]);
    mocks.itemAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { quantity: 0 } });
    mocks.slimeFindMany.mockResolvedValue([]);

    render(await AdminAuraPetPage());
    expect(screen.getByText("보유 중인 펫이 없습니다.")).toBeTruthy();
  });
});
