import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomBoardsTab } from "./ClassroomBoardsTab";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/CreateBoardModal", () => ({
  CreateBoardModal: ({
    classrooms,
    fixedClassroomId,
  }: {
    classrooms: Array<{ id: string; name: string; studentCount: number }>;
    fixedClassroomId?: string | null;
  }) => (
    <div role="dialog" aria-label="새 학급 보드 만들기">
      {fixedClassroomId}:{classrooms[0]?.name}:{classrooms[0]?.studentCount}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("ClassroomBoardsTab", () => {
  it("creates a new board directly inside the current classroom", () => {
    render(
      <ClassroomBoardsTab
        classroomId="classroom-1"
        classroomName="햇살반"
        studentCount={24}
        linkedBoards={[]}
        allBoards={[]}
      />,
    );

    expect(screen.getByText(/연결된 보드가 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ 새 보드 만들기" }));

    expect(screen.getByRole("dialog", { name: "새 학급 보드 만들기" })).toBeTruthy();
    expect(screen.getByText("classroom-1:햇살반:24")).toBeTruthy();
  });

  it("can auto-open the creator after the roster setup handoff", () => {
    render(
      <ClassroomBoardsTab
        classroomId="classroom-1"
        classroomName="햇살반"
        studentCount={24}
        linkedBoards={[]}
        allBoards={[]}
        autoOpenCreate
      />,
    );

    expect(screen.getByRole("dialog", { name: "새 학급 보드 만들기" })).toBeTruthy();
  });
});
