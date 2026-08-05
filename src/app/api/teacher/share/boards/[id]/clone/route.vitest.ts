import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  classroomFindFirst: vi.fn(),
  boardFindFirst: vi.fn(),
  transaction: vi.fn(),
  cloneTeacherBoard: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/boards/clone", () => ({
  SUPPORTED_CLONE_LAYOUTS: new Set(["freeform", "grid", "stream", "columns"]),
  cloneTeacherBoard: mocks.cloneTeacherBoard,
}));
vi.mock("@/lib/db", () => ({
  db: {
    classroom: { findFirst: mocks.classroomFindFirst },
    board: { findFirst: mocks.boardFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

function request(classroomId = "classroom-1") {
  return new Request("http://localhost/api/teacher/share/boards/board-1/clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ classroomId }),
  });
}

describe("POST /api/teacher/share/boards/:id/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.classroomFindFirst.mockResolvedValue({ id: "classroom-1" });
    mocks.boardFindFirst.mockResolvedValue({
      id: "board-1",
      title: "공유 보드",
      layout: "columns",
      sections: [],
    });
    mocks.transaction.mockImplementation(async (callback) => callback({ tx: true }));
    mocks.cloneTeacherBoard.mockResolvedValue({
      id: "copy-1",
      slug: "shared-copy",
      title: "공유 보드 (복사본)",
      layout: "columns",
    });
  });

  it("queries no cards and forces a private empty classroom clone", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: "board-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.classroomFindFirst).toHaveBeenCalledWith({
      where: { id: "classroom-1", teacherId: "teacher-1" },
      select: { id: true },
    });
    const sourceQuery = mocks.boardFindFirst.mock.calls[0]?.[0];
    expect(sourceQuery.where).toEqual({
      id: "board-1",
      systemGameKind: null,
      communityPublishedAt: { not: null },
    });
    expect(sourceQuery.include).toEqual({
      sections: { orderBy: { order: "asc" } },
    });
    expect(sourceQuery.include).not.toHaveProperty("cards");
    expect(mocks.cloneTeacherBoard).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({ id: "board-1", cards: [] }),
      "teacher-1",
      expect.objectContaining({
        classroomId: "classroom-1",
        copyCards: false,
      }),
    );
  });

  it("rejects a classroom not owned by the current teacher", async () => {
    mocks.classroomFindFirst.mockResolvedValue(null);

    const response = await POST(request("other-classroom"), {
      params: Promise.resolve({ id: "board-1" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.boardFindFirst).not.toHaveBeenCalled();
    expect(mocks.cloneTeacherBoard).not.toHaveBeenCalled();
  });
});
