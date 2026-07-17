import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatureHub } from "./CreatureHub";

type FetchResponse = Pick<Response, "ok" | "status" | "json">;

const activeCreature = {
  id: "creature-terramote",
  lineKey: "terramote",
  nameKo: "테라모트",
  affinity: "earth",
  stage: "hatchling",
  isActive: true,
  isFeatured: true,
  progressPoints: 5,
  nextThreshold: 8,
  behaviorSheetPath: "/creatures/terramote/hatchling/sheet.json",
};

const homePayload = {
  active: activeCreature,
  featured: activeCreature,
  collection: [
    {
      id: "creature-ripplekin",
      lineKey: "ripplekin",
      nameKo: "리플킨",
      affinity: "river",
      stage: "juvenile",
      isActive: false,
      isFeatured: false,
      progressPoints: 9,
      nextThreshold: 15,
      behaviorSheetPath: null,
    },
    {
      id: "creature-ripplekin-completed",
      lineKey: "ripplekin",
      nameKo: "리플킨",
      affinity: "river",
      stage: "evolved",
      isActive: false,
      isFeatured: false,
      progressPoints: 15,
      nextThreshold: null,
      behaviorSheetPath: null,
    },
    {
      id: "creature-tidalume-egg",
      lineKey: "tidalume",
      nameKo: "타이달룸",
      affinity: "sea",
      stage: "egg",
      isActive: false,
      isFeatured: false,
      progressPoints: 1,
      nextThreshold: 3,
      behaviorSheetPath: null,
    },
  ],
  balance: 900,
  currency: { unitLabel: "별" },
  items: [
    {
      id: "inventory-food-dew",
      itemKey: "food-dew-01",
      itemKind: "food",
      quantity: 2,
      isEquipped: false,
      product: {
        key: "food-dew-01",
        kind: "food",
        labelKo: "이슬 간식",
        descriptionKo: "성장 포인트 1을 채워요.",
        price: 120,
        effect: { progressDelta: 1 },
        visible: true,
      },
    },
    {
      id: "inventory-background-earth",
      itemKey: "background-earth-01",
      itemKind: "background-effect",
      quantity: 1,
      isEquipped: true,
      product: {
        key: "background-earth-01",
        kind: "background-effect",
        labelKo: "대지 이끼 빛",
        descriptionKo: "대지의 전시 배경 효과예요.",
        price: 250,
        effect: { effectKey: "ground-moss-glow" },
        visible: true,
      },
    },
  ],
  equippedBackground: {
    id: "inventory-background-earth",
    itemKey: "background-earth-01",
    itemKind: "background-effect",
    quantity: 1,
    isEquipped: true,
    product: {
      key: "background-earth-01",
      kind: "background-effect",
      labelKo: "대지 이끼 빛",
      descriptionKo: "대지의 전시 배경 효과예요.",
      price: 250,
      effect: { effectKey: "ground-moss-glow" },
      visible: true,
    },
  },
};

const hatchlingBehaviorEntries = [
  {
    kind: "normal",
    actionId: "walk",
    labelKo: "부화 산책",
    descriptionKo: "부화 단계에서 천천히 걸어요.",
  },
  {
    kind: "lazy",
    actionId: "rest",
    labelKo: "부화 느긋",
    descriptionKo: "부화 단계에서 포근히 쉬어요.",
  },
  {
    kind: "signature",
    actionId: "sparkle",
    labelKo: "부화 고유 행동",
    descriptionKo: "부화 단계의 반짝임을 보여줘요.",
  },
];

const catalogPayload = {
  lines: [
    {
      key: "terramote",
      affinity: "earth",
      nameKo: "테라모트",
      visualConcept: "moss",
      stages: [
        {
          stage: "hatchling",
          packageId: "terramote-hatchling",
          behaviorSheetId: "terramote-hatchling-behaviors",
          behaviorSheetPath: "/creatures/terramote/hatchling/sheet.json",
          behaviors: hatchlingBehaviorEntries,
        },
      ],
    },
    {
      key: "ripplekin",
      affinity: "river",
      nameKo: "리플킨",
      visualConcept: "ripple",
      stages: [],
    },
    {
      key: "tidalume",
      affinity: "sea",
      nameKo: "타이달룸",
      visualConcept: "foam",
      stages: [],
    },
  ],
  products: [
    {
      key: "food-dew-01",
      kind: "food",
      labelKo: "이슬 간식",
      descriptionKo: "성장 포인트 1을 채워요.",
      price: 120,
      effect: { progressDelta: 1 },
      visible: true,
    },
    {
      key: "background-earth-01",
      kind: "background-effect",
      labelKo: "대지 이끼 빛",
      descriptionKo: "대지의 전시 배경 효과예요.",
      price: 250,
      effect: { effectKey: "ground-moss-glow" },
      visible: true,
    },
    {
      key: "egg-random-01",
      kind: "random-egg",
      labelKo: "무작위 알",
      descriptionKo: "아직 만나지 못한 펫을 무작위로 만나요.",
      price: 300,
      effect: null,
      visible: true,
    },
  ],
};

function response(data: unknown, ok = true, status = ok ? 200 : 500): FetchResponse {
  return {
    ok,
    status,
    json: async () => data,
  };
}

function apiResponseFor(input: RequestInfo | URL): FetchResponse {
  const url = input.toString();
  if (url.endsWith("/api/student/creatures/catalog")) return response(catalogPayload);
  if (url.endsWith("/api/student/creatures")) return response(homePayload);
  throw new Error(`Unexpected request: ${url}`);
}

describe("CreatureHub", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the exhibition, shop, fitting room, and codex with server data", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => apiResponseFor(input));
    vi.stubGlobal("fetch", fetchMock);

    render(<CreatureHub />);

    expect(await screen.findByRole("heading", { name: "내 펫", level: 2 })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/student/creatures", expect.objectContaining({ cache: "no-store" }));

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["✦내 펫", "🛍상점", "✧피팅룸", "▦도감"]);
    expect(screen.getByRole("tab", { name: "내 펫" }).getAttribute("aria-selected")).toBe("true");

    expect(screen.getByRole("heading", { name: "테라모트", level: 3 })).toBeTruthy();
    expect(screen.getByText("대지")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "성장 진행도 40%" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /부화 산책/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /부화 느긋/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /부화 고유 행동/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByText("부화 단계에서 천천히 걸어요.")).toHaveLength(2);
    expect(screen.getByText("부화 산책")).toBeTruthy();
    expect(screen.getByText("부화 느긋")).toBeTruthy();
    expect(screen.getByText("부화 고유 행동")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "상점" }));
    expect(await screen.findByRole("heading", { name: "상점", level: 2 })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "내 펫" }).hasAttribute("aria-controls")).toBe(false);
    expect(screen.getByRole("tab", { name: "상점" }).getAttribute("aria-controls")).toBe("creature-panel-shop");
    expect(screen.getByRole("group", { name: "상점 상품 종류" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "이슬 간식", level: 3 })).toBeTruthy();
    expect(screen.getAllByRole("article")[0].textContent).toContain("120 별 / 개");
    expect(screen.getByRole("heading", { name: "대지 이끼 빛", level: 3 })).toBeTruthy();
    expect(screen.getAllByRole("article")[1].textContent).toContain("250 별 / 개");
    expect(screen.getByRole("button", { name: "이슬 간식 담기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이슬 간식 수량 늘리기" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "무작위 알 구매" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "피팅룸" }));
    expect(await screen.findByRole("heading", { name: "피팅룸", level: 2 })).toBeTruthy();
    expect(screen.getByText("이슬 간식")).toBeTruthy();
    expect((screen.getByRole("button", { name: "이슬 간식 사용" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("대지 이끼 빛")).toBeTruthy();
    expect((screen.getByRole("button", { name: "대지 이끼 빛 장착됨" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "배경 해제" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("tab", { name: "도감" }));
    expect(await screen.findByRole("heading", { name: "도감", level: 2 })).toBeTruthy();
    expect(screen.getByRole("article", { name: "테라모트 도감 카드" }).textContent).toContain("보유");
    const ripplekinCard = screen.getByRole("article", { name: "리플킨 도감 카드" });
    expect(ripplekinCard.textContent).toContain("진화까지");
    const tidalumeCard = screen.getByRole("article", { name: "타이달룸 도감 카드" });
    expect(tidalumeCard.textContent).toContain("미발견");
    expect(tidalumeCard.textContent).not.toContain("보유");
    expect(screen.queryByText("알까지")).toBeNull();
  });

  it("returns focus after Escape and reuses the purchase key after a lost POST response", async () => {
    let purchaseAttempts = 0;
    const purchaseBodies: Array<{ idempotencyKey?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/api/student/creatures/items/purchase")) {
        purchaseAttempts += 1;
        purchaseBodies.push(JSON.parse(String(init?.body)) as { idempotencyKey?: string });
        if (purchaseAttempts === 1) throw new Error("lost response");
        return response({});
      }
      return apiResponseFor(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreatureHub />);
    expect(await screen.findByRole("heading", { name: "내 펫", level: 2 })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "상점" }));

    const purchaseButton = screen.getByRole("button", { name: "이슬 간식 담기" }) as HTMLButtonElement;
    fireEvent.click(purchaseButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(purchaseButton);

    fireEvent.click(purchaseButton);
    fireEvent.click(screen.getByRole("button", { name: "구매 확정" }));
    await waitFor(() => expect(purchaseAttempts).toBe(1));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "구매 확정" }));
    await waitFor(() => expect(purchaseAttempts).toBe(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(purchaseButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "구매 확정" }));
    await waitFor(() => expect(purchaseAttempts).toBe(3));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(purchaseBodies).toHaveLength(3);
    expect(purchaseBodies[0].idempotencyKey).toBe(purchaseBodies[1].idempotencyKey);
    expect(purchaseBodies[2].idempotencyKey).not.toBe(purchaseBodies[1].idempotencyKey);
  });

  it("switches the featured pet and reloads the server snapshot", async () => {
    const ripplekin = homePayload.collection.find(
      (creature) => creature.id === "creature-ripplekin-completed",
    );
    let currentHome = homePayload;
    const featureBodies: Array<{ creatureId?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/api/student/creatures/feature")) {
        const body = JSON.parse(String(init?.body)) as { creatureId?: string };
        featureBodies.push(body);
        currentHome = {
          ...homePayload,
          featured: {
            ...activeCreature,
            id: ripplekin!.id,
            lineKey: ripplekin!.lineKey,
            nameKo: ripplekin!.nameKo,
            affinity: ripplekin!.affinity,
            stage: ripplekin!.stage,
            isActive: false,
            isFeatured: true,
            progressPoints: ripplekin!.progressPoints,
            nextThreshold: 15,
            behaviorSheetPath: "/creatures/ripplekin/evolved/sheet.json",
          },
        };
        return response({ featured: currentHome.featured });
      }
      if (url.endsWith("/api/student/creatures/catalog")) return response(catalogPayload);
      if (url.endsWith("/api/student/creatures")) return response(currentHome);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreatureHub />);
    expect(await screen.findByRole("heading", { name: "테라모트", level: 3 })).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "대표 펫" }), {
      target: { value: "creature-ripplekin-completed" },
    });

    await waitFor(() => expect(featureBodies).toEqual([
      { creatureId: "creature-ripplekin-completed" },
    ]));
    expect(await screen.findByRole("heading", { name: "리플킨", level: 3 })).toBeTruthy();
  });

  it("shows the load error and retries both API requests", async () => {
    let shouldFail = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (shouldFail) return response({ error: "temporary_failure" }, false);
      return apiResponseFor(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreatureHub />);

    expect((await screen.findByRole("alert")).textContent).toContain("펫 정보를 불러오지 못했어요");
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeTruthy();

    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByRole("heading", { name: "내 펫", level: 2 })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });
});
