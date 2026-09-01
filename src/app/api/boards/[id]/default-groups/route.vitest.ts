import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(async () => ({ id: "teacher-1", email: "teacher@example.com" })),
  boardFind: vi.fn(),
  studentFindMany: vi.fn(),
  requirePermission: vi.fn(),
  loadBoardGroups: vi.fn(),
  loadClassroomGroups: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findFirst: mocks.boardFind },
    student: { findMany: mocks.studentFindMany },
  },
}));
vi.mock("@/lib/rbac", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/default-groups", () => ({
  loadBoardDefaultGroups: mocks.loadBoardGroups,
  loadClassroomDefaultGroups: mocks.loadClassroomGroups,
  canUseClassroomDefaultGroupFallback: (email: string) => email === "mallagaenge@gmail.com",
}));

import { GET } from "./route";

describe("admin-only board default groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1", email: "teacher@example.com" });
  });

  it("does not expose classroom seating fallback to a non-admin board editor", async () => {
    mocks.boardFind.mockResolvedValueOnce({ id: "board-1", classroomId: "classroom-1" });
    mocks.studentFindMany.mockResolvedValueOnce([]);
    mocks.loadBoardGroups.mockResolvedValueOnce([]);
    const response = await GET(
      new Request("http://localhost/api/boards/board-1/default-groups"),
      { params: Promise.resolve({ id: "board-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ groups: [] });
    expect(mocks.requirePermission).toHaveBeenCalledWith("board-1", "teacher-1", "edit");
    expect(mocks.loadBoardGroups).not.toHaveBeenCalled();
    expect(mocks.loadClassroomGroups).not.toHaveBeenCalled();
  });

  it("keeps board and classroom defaults available to the administrator", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "admin-1",
      email: "mallagaenge@gmail.com",
    });
    mocks.boardFind.mockResolvedValueOnce({ id: "board-1", classroomId: "classroom-1" });
    mocks.studentFindMany.mockResolvedValueOnce([]);
    mocks.loadBoardGroups.mockResolvedValueOnce([]);
    mocks.loadClassroomGroups.mockResolvedValueOnce([
      { name: "1분단", studentIds: ["student-1"] },
    ]);

    const response = await GET(
      new Request("http://localhost/api/boards/board-1/default-groups"),
      { params: Promise.resolve({ id: "board-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      groups: [{ name: "1분단", studentIds: ["student-1"] }],
    });
  });
});
