import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameHubCatalog } from "./GameHubCatalog";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

describe("GameHubCatalog teacher mode", () => {
  const classrooms = [
    { id: "classroom-1", name: "햇살반", studentCount: 24 },
    { id: "classroom-2", name: "별빛반", studentCount: 18 },
  ];

  it("renders six uniform cards with Jam Live first and the five official games after it", () => {
    render(<GameHubCatalog viewer="teacher" classrooms={classrooms} />);

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(6);
    expect(
      within(cards[0]).getByRole("heading", { level: 3, name: "잼라이브" }),
    ).toBeTruthy();
    expect(within(cards[0]).getByText("LIVE")).toBeTruthy();
    expect(
      within(cards[0]).getByRole("button", { name: "잼라이브 게임 열기" }),
    ).toBeTruthy();
    for (const card of cards) {
      expect(within(card).getByRole("heading", { level: 3 })).toBeTruthy();
      expect(within(card).getByRole("button")).toBeTruthy();
    }
    expect(screen.queryByRole("link", { name: "나의 전적" })).toBeNull();
    expect(screen.queryByLabelText("놀이 학급")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "학급 선택" })).toBeNull();

    for (const title of [
      "그림자연합",
      "꼬들",
      "스피드게임",
      "오목",
      "노래 맞히기",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
      expect(screen.getByRole("img", { name: `${title} 게임 대표 아트` })).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: "게임 열기" })).toHaveLength(5);
  });

  it("shows live game state beside the game title with the entered-player count", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      statuses: {
        kordle: { phase: "open", label: "입장 가능", playerCount: 0 },
        "speed-game": { phase: "open", label: "입장 가능", playerCount: 0 },
        "shadow-alliance": { phase: "active", label: "진행 중", playerCount: 6 },
        omok: { phase: "active", label: "대국 중", playerCount: 2 },
        "song-guess": { phase: "open", label: "입장 가능", playerCount: 0 },
      },
    })));

    render(<GameHubCatalog viewer="teacher" classrooms={classrooms} />);

    const status = await screen.findByText("대국 중 · 2명");
    const titleRow = status.parentElement;
    expect(titleRow).not.toBeNull();
    expect(within(titleRow!).getByRole("heading", { level: 3, name: "오목" })).toBeTruthy();
  });

  it("opens a multi-classroom room after the teacher picks a class in the modal", async () => {
    const fetchMock = vi.fn(() =>
      json({
        gameKind: "omok",
        boardId: "room-omok",
        boardSlug: "game-hub-omok-classroom",
        href: "/board/game-hub-omok-classroom",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<GameHubCatalog viewer="teacher" classrooms={classrooms} />);

    const card = screen
      .getByRole("heading", { level: 3, name: "오목" })
      .closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card!).getByRole("button", { name: "게임 열기" }));

    const dialog = await screen.findByRole("dialog", { name: "학급 선택" });
    fireEvent.click(within(dialog).getByRole("button", { name: /별빛반/ }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/board/game-hub-omok-classroom");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teacher/game-hub/entry",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          gameKind: "omok",
          classroomId: "classroom-2",
        }),
      }),
    );
  });

  it("skips the classroom modal when the teacher owns only one class", async () => {
    const fetchMock = vi.fn(() =>
      json({
        gameKind: "omok",
        boardId: "room-omok",
        boardSlug: "game-hub-omok-classroom",
        href: "/board/game-hub-omok-classroom",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GameHubCatalog
        viewer="teacher"
        classrooms={[{ id: "classroom-1", name: "햇살반", studentCount: 24 }]}
      />,
    );

    const card = screen
      .getByRole("heading", { level: 3, name: "오목" })
      .closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card!).getByRole("button", { name: "게임 열기" }));

    expect(screen.queryByRole("dialog", { name: "학급 선택" })).toBeNull();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/board/game-hub-omok-classroom");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teacher/game-hub/entry",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          gameKind: "omok",
          classroomId: "classroom-1",
        }),
      }),
    );
  });

  it("keeps Jam Live available without a classroom but disables official rooms", () => {
    render(<GameHubCatalog viewer="teacher" classrooms={[]} />);

    expect(screen.getByRole("link", { name: "학급 만들기" })).toBeTruthy();
    expect(screen.getByText(/공식 게임방을 열려면 먼저 학급/)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "게임 열기" })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "잼라이브 게임 열기" }));
    expect(push).toHaveBeenCalledWith("/live-quiz");
  });
});

describe("GameHubCatalog student mode", () => {
  it("keeps Jam Live first, omits the records link, and routes students to student live quiz", () => {
    render(<GameHubCatalog />);

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(6);
    expect(
      within(cards[0]).getByRole("heading", { level: 3, name: "잼라이브" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "나의 전적" })).toBeNull();

    fireEvent.click(
      within(cards[0]).getByRole("button", { name: "잼라이브 입장" }),
    );
    expect(push).toHaveBeenCalledWith("/student/live-quiz");
  });
});
