import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentDashboard } from "./StudentDashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("StudentDashboard slime card", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("replaces legacy character links with the equipped slime snapshot", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/api/my/wallet")) {
        return json({
          balance: 500,
          currency: { unitLabel: "원", monthlyInterestRate: null },
          activeFDs: [],
        });
      }
      return json({
        balance: 320,
        currency: { unitLabel: "원" },
        ownedColors: ["blue"],
        equippedColors: ["blue"],
        representativeColor: "blue",
        equippedItemsByColor: { blue: ["slime-blue-trampoline"] },
        shopCatalog: [
          {
            key: "slime-blue-trampoline",
            category: "ride",
            labelKo: "트램펄린",
            price: 30,
            spritePath: "/creatures/slimes/shop/slime-blue-trampoline.gif",
          },
        ],
        catalog: [
          {
            key: "blue",
            color: "blue",
            nameKo: "블루 슬라임",
            effectKey: "growth_speed",
            baseBuffBps: 200,
            price: 100,
            spritePath: "/creatures/slimes/blue/idle.gif",
          },
        ],
        effects: { totals: { growth_speed: 200 } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StudentDashboard
        studentName="민지"
        classroomName="햇살반"
        classroomId="classroom-1"
        boards={[]}
        duties={[]}
      />,
    );

    expect(await screen.findByText("블루 슬라임")).toBeTruthy();
    expect(screen.getByText("파랑 슬라임")).toBeTruthy();
    expect(screen.getByText("활성 보상 버프 · 성장 속도 +2%")).toBeTruthy();
    expect(screen.getByText("잔액 320 원")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "블루 슬라임, 트램펄린 적용 미리보기" }).getAttribute("src"),
    ).toBe(
      "/creatures/slimes/shop/slime-blue-trampoline.gif",
    );
    expect(screen.getByRole("link", { name: "내 펫" }).getAttribute("href")).toBe(
      "/student/aura-pet",
    );
    for (const legacyText of ["나만의 캐릭터", "내 캐릭터", "피팅룸", "상점"]) {
      expect(screen.queryByText(legacyText)).toBeNull();
    }
  });
});
