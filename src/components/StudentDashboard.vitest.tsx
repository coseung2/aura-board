import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudentHomeBoard } from "@/lib/student-home-types";
import { legacyStudentBoardRedirect } from "./student/student-board-navigation";
import { StudentBoardHub, StudentDashboard } from "./StudentDashboard";

const replace = vi.fn();
const push = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/student/boards",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/supabase/client", () => ({
  createPublicSupabaseClient: () => ({
    channel: () => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
        send: vi.fn(async () => undefined),
      };
      return channel;
    },
    removeChannel: vi.fn(async () => undefined),
  }),
}));

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

const wallet = {
  balance: 500,
  currency: { unitLabel: "원", monthlyInterestRate: null },
  activeFDs: [],
};

const slime = {
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
      floor: "trampoline",
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
};

function board(overrides: Partial<StudentHomeBoard>): StudentHomeBoard {
  return {
    id: "board-1",
    slug: "board-1",
    title: "보드",
    layout: "card",
    category: "PLAY",
    anonymousAuthor: false,
    thumbnailMode: null,
    thumbnailUrl: null,
    boardTheme: null,
    streamSectionsEnabled: false,
    cardCount: 0,
    quizzes: [],
    kordleStatus: null,
    speedGameStatus: null,
    shadowAllianceStatus: null,
    breakout: null,
    ...overrides,
  };
}

function stubDashboardFetch(options?: {
  wallet?: (call: number) => Promise<Response>;
  slime?: () => Promise<Response>;
}) {
  let walletCalls = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.endsWith("/api/my/wallet")) {
      walletCalls += 1;
      return options?.wallet?.(walletCalls) ?? json(wallet);
    }
    return options?.slime?.() ?? json(slime);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDashboard(boards: StudentHomeBoard[] = []) {
  return render(
    <StudentDashboard
      studentName="민지"
      classroomName="햇살반"
      classroomId="classroom-1"
      boards={boards}
      duties={[]}
    />,
  );
}

function renderBoardHub(
  boards: StudentHomeBoard[] = [],
  params = new URLSearchParams(),
) {
  mockSearchParams = params;
  return render(<StudentBoardHub boards={boards} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
  push.mockReset();
  mockSearchParams = new URLSearchParams();
});

describe("StudentDashboard pet hero", () => {
  it("renders the equipped representative pet before wallet content", async () => {
    stubDashboardFetch();
    renderDashboard();

    const petHero = await screen.findByRole("region", { name: "내 대표 펫" });
    const walletRegion = screen.getByRole("region", { name: "은행" });
    expect(
      petHero.compareDocumentPosition(walletRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("블루 슬라임")).toBeTruthy();
    expect(screen.getByText("활성 보상 버프 · 성장 속도 +2%")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "블루 슬라임, 트램펄린 적용 미리보기" })
        .getAttribute("data-equipped-floor"),
    ).toBe("trampoline");
    expect(
      screen.getByRole("link", { name: "펫 관리하기" }).getAttribute("href"),
    ).toBe("/student/aura-pet");
  });

  it("shows an empty representative state when no slime is selected", async () => {
    stubDashboardFetch({
      slime: () =>
        json({
          balance: 0,
          currency: { unitLabel: "원" },
          ownedColors: [],
          catalog: [],
        }),
    });
    renderDashboard();
    expect(await screen.findByText("아직 대표 슬라임이 없어요.")).toBeTruthy();
  });

  it("shows a retryable pet error", async () => {
    let calls = 0;
    stubDashboardFetch({
      slime: () => {
        calls += 1;
        return calls === 1 ? json({}, 500) : json(slime);
      },
    });
    renderDashboard();

    const alert = (await screen.findByText("슬라임 정보를 불러오지 못했어요."))
      .parentElement as HTMLElement;
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("블루 슬라임")).toBeTruthy();
  });
});

describe("student home and board hub separation", () => {
  const playBoards = [
    board({ id: "idle", slug: "idle", title: "일반 놀이", layout: "card" }),
    board({ id: "kordle", slug: "kordle", title: "오늘의 코들", layout: "kordle", kordleStatus: "LIVE" }),
    board({ id: "speed", slug: "speed", title: "번개 낱말", layout: "speed-game", speedGameStatus: "running" }),
    board({ id: "quiz", slug: "quiz", title: "실시간 퀴즈", layout: "quiz", quizzes: [{ roomCode: "123456", status: "active" }] }),
    board({ id: "shadow", slug: "shadow", title: "그림자 연합", layout: "shadow-alliance", shadowAllianceStatus: "active" }),
  ];

  it("keeps the home concise and removes the full board explorer", async () => {
    stubDashboardFetch();
    const { container } = renderDashboard(playBoards);
    await screen.findByText("블루 슬라임");

    expect(screen.getByRole("heading", { level: 1, name: "홈" })).toBeTruthy();
    expect(container.querySelectorAll(".student-board-highlight")).toHaveLength(1);
    expect(screen.getByText("실시간 퀴즈")).toBeTruthy();
    expect(screen.queryByText("오늘의 코들")).toBeNull();
    expect(screen.queryByText("번개 낱말")).toBeNull();
    expect(container.querySelector(".student-board-card")).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "보드 검색" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /수업/ })).toBeNull();
  });

  it("renders the canonical five games with generated art even with zero teacher boards", () => {
    const { container } = renderBoardHub(
      [],
      new URLSearchParams("category=play"),
    );

    expect(screen.getByRole("tab", { name: /놀이\s*5/ }).getAttribute("aria-selected"))
      .toBe("true");
    for (const title of ["그림자연합", "꼬들", "스피드게임", "오목", "노래 맞히기"]) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
      expect(screen.getByRole("img", { name: `${title} 게임 대표 아트` })).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: "입장하기" })).toHaveLength(5);
    expect(container.querySelector(".student-board-card")).toBeNull();
  });

  it("enters a canonical server-owned room from the catalog action", async () => {
    const fetchMock = vi.fn(() =>
      json({
        gameKind: "omok",
        boardId: "room-omok",
        boardSlug: "game-hub-omok-classroom",
        href: "/board/game-hub-omok-classroom?view=student",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoardHub([], new URLSearchParams("category=play"));

    const card = screen
      .getByRole("heading", { level: 3, name: "오목" })
      .closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card!).getByRole("button", { name: "입장하기" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        "/board/game-hub-omok-classroom?view=student",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/student/game-hub/entry",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ gameKind: "omok" }),
      }),
    );
  });

  it("does not render legacy teacher-created game boards as generic cards", () => {
    renderBoardHub(
      [
        board({ id: "lesson", slug: "lesson", title: "우리 반 수업", category: "LESSON" }),
        board({ id: "legacy-omok", slug: "legacy-omok", title: "교사가 만든 오목", layout: "omok" }),
      ],
      new URLSearchParams("category=all"),
    );

    expect(screen.getByText("우리 반 수업")).toBeTruthy();
    expect(screen.queryByText("교사가 만든 오목")).toBeNull();
  });

  it("keeps the game catalog and personal records as the only play sub-tabs", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      schemaVersion: 1,
      appliedFilter: { gameKind: "all", range: "30d", limit: 20 },
      summary: {
        totalPlays: 0,
        completedCount: 0,
        bestScore: null,
        latestCompletedAt: null,
      },
      facets: {},
      records: [],
      nextCursor: null,
    })));
    renderBoardHub(
      [board({ id: "lesson", slug: "lesson", title: "우리 반 수업", category: "LESSON" })],
      new URLSearchParams("category=play&keep=yes"),
    );

    expect(screen.getByRole("tab", { name: "게임" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "나의 전적" }));
    expect(await screen.findByRole("heading", { level: 2, name: "나의 전적" })).toBeTruthy();
    expect(screen.queryByRole("searchbox", { name: "보드 검색" })).toBeNull();
    expect(replace).toHaveBeenLastCalledWith(
      "/student/boards?category=play&keep=yes&playTab=records",
      { scroll: false },
    );
  });

  it("opens the existing breakout selection behavior from priority", () => {
    renderBoardHub([
      board({
        id: "breakout",
        title: "모둠 수업",
        category: "LESSON",
        breakout: {
          assignmentId: "assignment-1",
          boardSlug: "breakout-room",
          boardTitle: "모둠 교실",
          groupCapacity: 4,
          selectedSectionId: null,
          groups: [
            {
              groupIndex: 1,
              entrySectionId: "section-1",
              totalCount: 2,
              sections: [{ id: "section-1", title: "생각", count: 2 }],
            },
          ],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /모둠 수업/ }));
    expect(screen.getByRole("dialog", { name: "모둠 선택" })).toBeTruthy();
  });

  it("keeps an already assigned breakout board in priority", () => {
    renderBoardHub([
      board({
        id: "assigned-breakout",
        title: "배정된 모둠 수업",
        category: "LESSON",
        breakout: {
          assignmentId: "assignment-2",
          boardSlug: "assigned-breakout-room",
          boardTitle: "배정된 모둠 교실",
          groupCapacity: 4,
          selectedSectionId: "section-2",
          groups: [],
        },
      }),
    ]);

    expect(screen.getByRole("tab", { name: /우선\s*1/ })).toBeTruthy();
    expect(screen.getByText("배정된 모둠 수업")).toBeTruthy();
  });
});

describe("legacy student board URL mapping", () => {
  it("redirects legacy board categories while preserving other query values", () => {
    expect(
      legacyStudentBoardRedirect({
        board: "play",
        q: "퀴즈",
        tag: ["live", "today"],
      }),
    ).toBe(
      "/student/boards?q=%ED%80%B4%EC%A6%88&tag=live&tag=today&category=play",
    );
    expect(legacyStudentBoardRedirect({ board: "unknown" })).toBeNull();
  });
});

describe("StudentDashboard wallet", () => {
  it("replaces a failed load with a visible retry and recovers", async () => {
    const fetchMock = stubDashboardFetch({
      wallet: (call) => (call === 1 ? json({}, 503) : json(wallet)),
    });
    renderDashboard();

    const alert = (await screen.findByText("통장 정보를 불러오지 못했어요."))
      .parentElement as HTMLElement;
    expect(screen.queryByText("통장 정보를 불러오는 중이에요.")).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("500 원")).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([input]) => input.toString().endsWith("/api/my/wallet")),
      ).toHaveLength(2),
    );
  });
});
