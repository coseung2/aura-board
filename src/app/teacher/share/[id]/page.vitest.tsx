import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  boardFindFirst: vi.fn(),
  classroomFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin", () => ({ isAdminEmail: () => false }));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findFirst: mocks.boardFindFirst },
    classroom: { findMany: mocks.classroomFindMany },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/components/TopNav", () => ({ TopNav: () => null }));
vi.mock("@/components/teacher/CommunityCopyButton", () => ({
  CommunityCopyButton: () => null,
}));
vi.mock("@/components/teacher/CommunityBoardPreview", () => ({
  CommunityBoardPreview: () => null,
}));

import TeacherSharePreviewPage from "./page";

describe("TeacherSharePreviewPage query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "teacher-1",
      email: "teacher@example.com",
    });
    mocks.classroomFindMany.mockResolvedValue([]);
    mocks.boardFindFirst.mockResolvedValue({
      id: "board-1",
      title: "공유 보드",
      description: "",
      layout: "columns",
      category: "LESSON",
      boardTheme: "pastel-sky",
      anonymousAuthor: false,
      communityPublishedAt: new Date("2026-08-05T00:00:00.000Z"),
      members: [],
      sections: [],
      cards: [],
    });
  });

  it("requires an active community publication and never selects mutation credentials", async () => {
    await TeacherSharePreviewPage({
      params: Promise.resolve({ id: "board-1" }),
    });

    const query = mocks.boardFindFirst.mock.calls[0]?.[0];
    expect(query.where).toEqual(
      expect.objectContaining({
        id: "board-1",
        systemGameKind: null,
        communityPublishedAt: { not: null },
      }),
    );
    expect(query.select).not.toHaveProperty("shareMode");
    expect(query.select).not.toHaveProperty("shareToken");
    expect(query.select).not.toHaveProperty("shareShortCode");
    expect(query.select).not.toHaveProperty("accessToken");
    expect(query.select.cards.select).not.toHaveProperty("boardId");
  });
});
