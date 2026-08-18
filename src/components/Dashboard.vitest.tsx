import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

const refresh = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./game-platform/GameHubCatalog", () => ({
  GameHubCatalog: ({
    viewer,
    classrooms,
  }: {
    viewer: string;
    classrooms: Array<{ id: string; name: string }>;
  }) => (
    <section aria-label="교사 공식 게임 허브">
      {viewer}:{classrooms.map((classroom) => classroom.name).join(",")}
    </section>
  ),
}));
vi.mock("./CreateBoardModal", () => ({
  CreateBoardModal: () => <div>새 보드 모달</div>,
}));
vi.mock("./EditBoardModal", () => ({
  EditBoardModal: () => <div>보드 편집 모달</div>,
}));

const classrooms = [{ id: "classroom-1", name: "햇살반", studentCount: 24 }];
const boards = [
  {
    id: "lesson-1",
    slug: "lesson-1",
    title: "우리 반 수업",
    layout: "columns",
    thumbnailMode: null,
    thumbnailUrl: null,
    classroomId: "classroom-1",
    category: "LESSON" as const,
    cardCount: 3,
    memberCount: 1,
    role: "owner",
  },
  {
    id: "system-omok",
    slug: "game-hub-omok",
    title: "오목",
    layout: "omok",
    thumbnailMode: "none",
    thumbnailUrl: null,
    classroomId: "classroom-1",
    category: "PLAY" as const,
    cardCount: 0,
    memberCount: 1,
    role: "owner",
  },
  {
    id: "legacy-play",
    slug: "legacy-play",
    title: "예전 놀이보드",
    layout: "quiz",
    thumbnailMode: null,
    thumbnailUrl: null,
    classroomId: "classroom-1",
    category: "PLAY" as const,
    cardCount: 0,
    memberCount: 1,
    role: "owner",
  },
];

afterEach(() => {
  cleanup();
  refresh.mockReset();
  replace.mockReset();
});

describe("teacher dashboard board sections", () => {
  it("keeps lesson creation in the lesson tab and uses the game hub for play", () => {
    render(<Dashboard boards={boards} classrooms={classrooms} isAdmin />);

    expect(screen.getByText("우리 반 수업")).toBeTruthy();
    expect(screen.getByRole("button", { name: /새 보드 만들기/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /놀이\s*6/ }));

    expect(replace).toHaveBeenCalledWith("/dashboard?category=play", {
      scroll: false,
    });
    expect(screen.getByRole("region", { name: "교사 공식 게임 허브" })).toBeTruthy();
    expect(screen.getByText("teacher:햇살반")).toBeTruthy();
    expect(screen.queryByText("우리 반 수업")).toBeNull();
    expect(screen.queryByText("game-hub-omok")).toBeNull();
    expect(screen.queryByRole("button", { name: /새 보드 만들기/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "기존 놀이보드" })).toBeNull();
    expect(screen.queryByText("예전 놀이보드")).toBeNull();
    expect(screen.queryByRole("link", { name: /학급 관리/ })).toBeNull();
  });

  it("hides the play tab for a non-admin teacher", () => {
    render(<Dashboard boards={boards} classrooms={classrooms} />);

    expect(screen.getByText("우리 반 수업")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /놀이/ })).toBeNull();
    expect(screen.queryByText("예전 놀이보드")).toBeNull();
  });
});
