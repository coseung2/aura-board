import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAuraPetPage from "./page";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  creatureCount: vi.fn(),
  creatureItemAggregate: vi.fn(),
  creatureGroupBy: vi.fn(),
  creatureFindMany: vi.fn(),
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
    studentCreature: {
      count: mocks.creatureCount,
      groupBy: mocks.creatureGroupBy,
      findMany: mocks.creatureFindMany,
    },
    studentCreatureItem: {
      aggregate: mocks.creatureItemAggregate,
    },
  },
}));

vi.mock("@/lib/creatures/catalog", () => ({
  CREATURE_STAGES: ["egg", "hatchling", "juvenile", "evolved"],
  CREATURE_LINES: [
    {
      key: "terramote",
      affinity: "earth",
      nameKo: "테라모트",
      rarity: "common",
      randomEggWeight: 3,
      affinityEggWeight: 1,
      stages: [
        { stage: "egg", behaviors: [{ labelKo: "고요한 숨" }, { labelKo: "졸린 흔들" }, { labelKo: "흙맥박" }] },
        { stage: "hatchling", behaviors: [{ labelKo: "이끼 발돋움" }, { labelKo: "돌틈 웅크림" }, { labelKo: "씨앗 흙먼지" }] },
        { stage: "juvenile", behaviors: [{ labelKo: "뿌리 점프" }, { labelKo: "그늘 낮잠" }, { labelKo: "돌꽃 피우기" }] },
        { stage: "evolved", behaviors: [{ labelKo: "대지 인사" }, { labelKo: "느긋한 뿌리춤" }, { labelKo: "작은 지진 리듬" }] },
      ],
    },
  ],
  CREATURE_RANDOM_EGG_WEIGHTS: [{ lineKey: "terramote", weight: 3 }],
  CREATURE_SHOP_PRODUCTS: [
    {
      key: "egg-earth-01",
      kind: "affinity-egg",
      labelKo: "대지 알",
      descriptionKo: "대지 전용 알",
      price: 100,
      effect: { type: "affinity-egg", affinity: "earth" },
      visible: true,
    },
  ],
}));

describe("AdminAuraPetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ authorized: true });
    mocks.creatureCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    mocks.creatureItemAggregate.mockResolvedValue({
      _count: { _all: 1 },
      _sum: { quantity: 2 },
    });
    mocks.creatureGroupBy.mockResolvedValue([{ stage: "egg", _count: { _all: 1 } }]);
    mocks.creatureFindMany.mockResolvedValue([
      {
        id: "creature-1",
        lineKey: "terramote",
        stage: "egg",
        progressPoints: 2,
        isActive: true,
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
        student: {
          name: "가온",
          number: 3,
          classroom: {
            name: "햇살반",
            teacher: { name: "이선생", email: "teacher@example.com" },
          },
        },
      },
    ]);
  });

  it("renders catalog stages and recent owned creature context", async () => {
    render(await AdminAuraPetPage());

    expect(mocks.requireAdminUser).toHaveBeenCalledWith("/admin/aura-pet");
    expect(mocks.creatureGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["stage"] }),
    );
    expect(screen.getByRole("heading", { name: "성장 단계 분포" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "펫 카탈로그" })).toBeTruthy();
    expect(screen.getAllByText("테라모트").length).toBeGreaterThan(0);
    expect(screen.getByText("고요한 숨 · 졸린 흔들 · 흙맥박")).toBeTruthy();
    expect(screen.getByText("가온 (3번)")).toBeTruthy();
    expect(screen.getByText("햇살반")).toBeTruthy();
    expect(screen.getByText("2점")).toBeTruthy();
  });

  it("shows empty states when the database has no creatures", async () => {
    mocks.creatureCount.mockReset();
    mocks.creatureCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mocks.creatureItemAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { quantity: 0 },
    });
    mocks.creatureGroupBy.mockResolvedValue([]);
    mocks.creatureFindMany.mockResolvedValue([]);

    render(await AdminAuraPetPage());

    expect(screen.getByText("보유 중인 펫이 없습니다.")).toBeTruthy();
    expect(screen.getByText("아직 보유 중인 펫이 없습니다.")).toBeTruthy();
  });
});
