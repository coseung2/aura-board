import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomList } from "./ClassroomList";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/client-lookup-cache", () => ({
  notifyClassroomListChanged: vi.fn(),
}));
vi.mock("./CreateClassroomModal", () => ({
  CreateClassroomModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: (classroom: { id: string } | null) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onCreated({ id: "classroom-new" })}>
        테스트 학급 생성 완료
      </button>
    ) : null,
}));
vi.mock("./classroom/ClassroomDeleteModal", () => ({
  ClassroomDeleteModal: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClassroomList first setup", () => {
  it("shows one classroom-create CTA when the list is empty", () => {
    render(<ClassroomList classrooms={[]} onRefresh={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: "학급 만들기" })).toHaveLength(1);
    expect(screen.getByText("첫 학급을 만들어 학생을 등록해 보세요.")).toBeTruthy();
  });

  it("resumes the board creation intent after creating the required classroom", () => {
    render(
      <ClassroomList
        classrooms={[]}
        onRefresh={vi.fn()}
        autoOpenCreate
        resumeBoardLayout="freeform"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "테스트 학급 생성 완료" }));
    expect(router.push).toHaveBeenCalledWith(
      "/dashboard?create=1&layout=freeform&classroomId=classroom-new",
    );
  });

  it("labels the classroom identifier as an integration code", () => {
    render(
      <ClassroomList
        classrooms={[
          {
            id: "classroom-1",
            name: "햇살반",
            code: "ABCDEF",
            _count: { students: 24, boards: 2 },
          },
        ]}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("연동 코드 · ABCDEF")).toBeTruthy();
  });
});
