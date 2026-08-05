import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityCopyButton } from "./CommunityCopyButton";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const classrooms = [
  { id: "classroom-1", name: "1학년 1반" },
  { id: "classroom-2", name: "1학년 2반" },
];

describe("CommunityCopyButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains the empty-copy contract and restores focus after Escape", async () => {
    render(<CommunityCopyButton boardId="board-1" classrooms={classrooms} />);
    const trigger = screen.getByRole("button", { name: "내 반으로 복사" });

    fireEvent.click(trigger);
    const select = screen.getByRole("combobox", { name: "학급" });
    await waitFor(() => expect(select).toHaveFocus());
    expect(screen.getByText(/게시물과 학생 결과물은 제외/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("submits only the selected target classroom and opens the private copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ boardUrl: "/board/copied-board" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityCopyButton boardId="board-1" classrooms={classrooms} />);

    fireEvent.click(screen.getByRole("button", { name: "내 반으로 복사" }));
    fireEvent.change(screen.getByRole("combobox", { name: "학급" }), {
      target: { value: "classroom-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "빈 보드로 복사" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/teacher/share/boards/board-1/clone",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ classroomId: "classroom-2" }),
        }),
      );
      expect(routerPush).toHaveBeenCalledWith("/board/copied-board");
    });
  });
});
