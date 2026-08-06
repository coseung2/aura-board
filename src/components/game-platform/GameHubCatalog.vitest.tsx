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

  it("shows Jam Live and the same five official game entries as the student hub", () => {
    render(<GameHubCatalog viewer="teacher" classrooms={classrooms} />);

    expect(screen.getByRole("heading", { level: 3, name: "잼라이브" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "나의 전적" })).toBeNull();
    expect(screen.getByLabelText("놀이 학급")).toBeTruthy();

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

  it("opens the selected teacher-owned classroom room", async () => {
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

    fireEvent.change(screen.getByLabelText("놀이 학급"), {
      target: { value: "classroom-2" },
    });
    const card = screen
      .getByRole("heading", { level: 3, name: "오목" })
      .closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card!).getByRole("button", { name: "게임 열기" }));

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

  it("keeps Jam Live available without a classroom but disables official rooms", () => {
    render(<GameHubCatalog viewer="teacher" classrooms={[]} />);

    expect(screen.getByRole("link", { name: "학급 만들기" })).toBeTruthy();
    expect(screen.getByText(/공식 게임방을 열려면 먼저 학급/)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: "게임 열기" })) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "잼라이브 입장" }));
    expect(push).toHaveBeenCalledWith("/live-quiz");
  });
});
