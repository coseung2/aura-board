import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreateBoardModal } from "./CreateBoardModal";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 학급 선택 단계: 학급이 없으면 고를 게 "학급 연결 없음" 하나뿐이라 막다른
// 길이 되므로 학급 만들기 출구가 붙어야 한다. 출구는 학급 카드와 같은
// 그리드 안에서 같은 크기의 카드로, 파란 점선 테두리로 강조한다. 카드
// 아이콘은 글리프(□/▥) 대신 lucide SVG 다.

function openClassroomStep() {
  fireEvent.click(screen.getByText("DJ"));
}

describe("CreateBoardModal classroom step", () => {
  it("offers 학급 만들기 as a card next to 학급 연결 없음", () => {
    const { container } = render(
      <CreateBoardModal classrooms={[]} onClose={vi.fn()} />,
    );
    openClassroomStep();

    const create = screen.getByRole("link", { name: "학급 만들기" });
    expect(create.getAttribute("href")).toBe("/classroom");
    expect(create.className).toContain("classroom-choice-create");
    expect(create.className).not.toContain("classroom-choice-card");

    const grid = container.querySelector(".classroom-choice-grid");
    expect(grid).not.toBeNull();
    expect(grid?.contains(create)).toBe(true);
    // "학급 연결 없음" 다음 자리 — 두 번째 카드다.
    expect(create.previousElementSibling?.className).toContain(
      "classroom-choice-card",
    );
    expect(
      Array.from(grid?.children ?? []).map((child) => child.className),
    ).toEqual(["classroom-choice-card", "classroom-choice-create"]);

    expect(
      container.querySelector("svg.classroom-choice-icon"),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("□");
  });

  it("lists classrooms as cards and drops the 학급 만들기 exit", () => {
    const { container } = render(
      <CreateBoardModal
        classrooms={[{ id: "classroom-1", name: "햇살반", studentCount: 24 }]}
        onClose={vi.fn()}
      />,
    );
    openClassroomStep();

    expect(screen.queryByRole("link", { name: "학급 만들기" })).toBeNull();
    expect(container.querySelector(".classroom-choice-grid")).not.toBeNull();
    expect(
      container.querySelectorAll(".classroom-choice-card").length,
    ).toBe(2);
    expect(container.textContent).toContain("햇살반");
    expect(container.textContent).toContain("학생 24명");
    expect(
      container.querySelectorAll("svg.classroom-choice-icon").length,
    ).toBe(2);
    expect(container.textContent).not.toContain("□");
    expect(container.textContent).not.toContain("▥");
  });
});
