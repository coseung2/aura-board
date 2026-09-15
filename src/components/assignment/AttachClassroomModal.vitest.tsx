import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AttachClassroomModal } from "./AttachClassroomModal";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 학급 배당 모달도 새 보드 만들기의 학급 카드와 같은 모양을 쓴다.

describe("AttachClassroomModal classroom cards", () => {
  it("renders the shared card shape with a lucide icon", () => {
    const { container } = render(
      <AttachClassroomModal
        boardId="board-1"
        mode="attach"
        classrooms={[{ id: "classroom-1", name: "햇살반", studentCount: 24 }]}
        onClose={vi.fn()}
      />,
    );

    expect(container.querySelector(".classroom-choice-grid")).not.toBeNull();
    expect(container.querySelectorAll(".classroom-choice-card").length).toBe(1);
    expect(container.querySelector("svg.classroom-choice-icon")).not.toBeNull();
    expect(container.textContent).not.toContain("🏫");
    expect(container.textContent).toContain("slot 24개 생성");
  });

  it("offers 학급 만들기 as a grid card when the teacher has no classroom", () => {
    const { container } = render(
      <AttachClassroomModal
        boardId="board-1"
        mode="attach"
        classrooms={[]}
        onClose={vi.fn()}
      />,
    );

    const create = screen.getByRole("link", { name: "학급 만들기" });
    expect(create.getAttribute("href")).toBe("/classroom");

    const grid = container.querySelector(".classroom-choice-grid");
    expect(grid).not.toBeNull();
    expect(grid?.contains(create)).toBe(true);
    expect(create.className).toContain("classroom-choice-create");
    expect(container.querySelectorAll(".classroom-choice-card").length).toBe(0);
  });
});
