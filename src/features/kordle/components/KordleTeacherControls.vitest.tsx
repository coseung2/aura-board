import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { KordleTeacherControls } from "./KordleTeacherControls";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mocks.refresh.mockReset();
});

describe("KordleTeacherControls UX", () => {
  it("shows creation controls only before a draft exists", () => {
    render(
      <KordleTeacherControls
        boardId="board-1"
        initialLocale="ko-KR"
        puzzleId={null}
        puzzleStatus={null}
        puzzleVersion={0}
      />,
    );

    expect(screen.getByRole("textbox", { name: "꼬들 정답" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "문제 만들기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "무작위 문제" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "게임 시작" })).toBeNull();
  });

  it("turns an existing draft into a review boundary with start or cancel only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: 3 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KordleTeacherControls
        boardId="board-1"
        initialLocale="ko-KR"
        puzzleId="puzzle-1"
        puzzleStatus="DRAFT"
        puzzleVersion={2}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "꼬들 정답" })).toBeNull();
    expect(screen.queryByRole("button", { name: "문제 만들기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "무작위 문제" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "게임 시작" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      action: "start",
      puzzleId: "puzzle-1",
      expectedVersion: 2,
    });
    expect(screen.getByRole("button", { name: "문제 취소" })).toBeTruthy();
  });

  it("requires confirmation before ending a live puzzle", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <KordleTeacherControls
        boardId="board-1"
        initialLocale="ko-KR"
        puzzleId="puzzle-1"
        puzzleStatus="LIVE"
        puzzleVersion={2}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "꼬들 정답" })).toBeNull();
    expect(screen.queryByRole("button", { name: "게임 시작" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "게임 종료" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
