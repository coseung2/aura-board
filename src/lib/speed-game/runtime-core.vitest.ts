import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentStudentIdentityRaw: vi.fn(),
  getBoardRole: vi.fn(),
  boardFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/student-auth", () => ({
  getCurrentStudentIdentityRaw: mocks.getCurrentStudentIdentityRaw,
}));
vi.mock("@/lib/rbac", () => ({
  getBoardRole: mocks.getBoardRole,
}));
vi.mock("@/lib/db", () => ({
  db: {
    board: { findUnique: mocks.boardFindUnique },
  },
}));

import { authenticateGameViewer } from "./runtime-core";

describe("authenticateGameViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getCurrentStudentIdentityRaw.mockResolvedValue(null);
    mocks.getBoardRole.mockResolvedValue(null);
    mocks.boardFindUnique.mockResolvedValue(null);
  });

  it("returns the teacher role without loading a student identity", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });
    mocks.getBoardRole.mockResolvedValue("owner");

    await expect(authenticateGameViewer("board-1")).resolves.toEqual({
      kind: "teacher",
      userId: "teacher-1",
      role: "owner",
    });
    expect(mocks.getCurrentStudentIdentityRaw).not.toHaveBeenCalled();
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
  });

  it("does not fall back to a stale student cookie for an unrelated teacher", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-2" });
    mocks.getBoardRole.mockResolvedValue(null);
    mocks.getCurrentStudentIdentityRaw.mockResolvedValue({
      id: "student-1",
      name: "학생",
      classroomId: "class-1",
    });

    await expect(authenticateGameViewer("board-1")).resolves.toEqual({
      kind: "unauthorized",
    });
    expect(mocks.getCurrentStudentIdentityRaw).not.toHaveBeenCalled();
    expect(mocks.boardFindUnique).not.toHaveBeenCalled();
  });

  it("uses the lightweight student identity for a matching classroom", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthenticated"));
    mocks.getCurrentStudentIdentityRaw.mockResolvedValue({
      id: "student-1",
      name: "학생",
      classroomId: "class-1",
    });
    mocks.boardFindUnique.mockResolvedValue({ classroomId: "class-1" });

    await expect(authenticateGameViewer("board-1")).resolves.toEqual({
      kind: "student",
      studentId: "student-1",
      classroomId: "class-1",
    });
    expect(mocks.boardFindUnique).toHaveBeenCalledWith({
      where: { id: "board-1" },
      select: { classroomId: true },
    });
  });
});
